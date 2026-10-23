"""Account lifecycle, one-use credentials and a transactional notification outbox.

No plaintext tokens are persisted. Failed/uncertain token delivery requires an
explicit replacement, which revokes the previous link; retries reuse history.
"""
import secrets
from datetime import timedelta
from sqlalchemy import select, func, update
from app.models.account_workflows import AccountLink, Notification, RecoveryRequest
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.security.auth import now, aware, digest, permissions
from app.security.hashing import hash_password
from app.services.auth import audit, revoke_all, DUMMY_HASH
from app.security.hashing import verify_password
from app.services.membership import advisory
from app.services import access
from app.services.invitation_delivery import get_invitation_mailer, DeliveryNotSubmitted
from app.exceptions import APIError


def fail(message, status=409):
    raise APIError(status, 'account_workflow', message)


def lock_user(db, identifier):
    if db.bind.dialect.name == 'sqlite':
        db.execute(update(User).where(User.id==identifier).values(id=User.id,updated_at=User.updated_at))
    return db.execute(select(User).where(User.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one()


def link_status(row):
    return {'purpose':row.purpose,'issued_at':row.issued_at,'expires_at':row.expires_at,
            'consumed_at':row.consumed_at,'revoked_at':row.revoked_at,'delivery_state':row.delivery_state}


def issue(db, user, purpose, request_key, actor=None):
    key=str(request_key)
    advisory(db,'account-link-key:'+key)
    old=db.query(AccountLink).filter_by(request_key=key).one_or_none()
    if old:
        if old.user_id!=user.id or old.purpose!=purpose or old.issued_by!=(actor.id if actor else None):
            fail('Request key already used')
        return old, None
    user=lock_user(db,user.id)
    if not user.is_active or (purpose=='staff' and user.password_hash):fail('Setup unavailable for this account')
    db.execute(update(AccountLink).where(AccountLink.user_id==user.id,AccountLink.consumed_at.is_(None),AccountLink.revoked_at.is_(None)).values(revoked_at=now()))
    token=secrets.token_urlsafe(32)
    row=AccountLink(token_hash=digest(token),user_id=user.id,purpose=purpose,request_key=key,
        issued_by=actor.id if actor else None,expires_at=now()+timedelta(minutes=60),delivery_state='Not sent')
    db.add(row);db.flush()
    if actor:
        audit(db,actor,purpose+'_link_issued',user.id)
    else:
        from app.models.audit_event import AuditEvent
        db.add(AuditEvent(event_type='security',action='public_recovery_link_issued',target_table='users',target_id=str(user.id),details='Public request processed by account worker; no authenticated requester.'))
    return row,token


def deliver_link(db,row,token):
    if token is None:return
    # Commit link/account before SMTP. Delivery failure cannot repeat provisioning.
    user=db.get(User,row.user_id)
    recipient=user.email;key=row.request_key;purpose=row.purpose
    from app.services.business_settings import public_contacts
    contacts=public_contacts(db)
    mailer=get_invitation_mailer()
    row.delivery_state='Sending' if mailer.available else 'Unavailable'
    db.commit()
    if not mailer.available:return
    try:
        mailer.send_account(recipient=recipient,token=token,request_key=key,purpose=purpose,contacts=contacts)
        row.delivery_state='Mailpit accepted'
    except Exception:
        # Do not serialize provider exception/body or claim inbox delivery.
        row.delivery_state='Failed or uncertain'
    db.commit()


def invite_staff(db,actor,body):
    access.guard(db,actor)
    email=body.email.strip().lower()
    advisory(db,'staff-email:'+email)
    old=db.query(AccountLink).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        user=db.get(User,old.user_id)
        if old.issued_by!=actor.id or old.purpose!='staff' or user.email!=email:fail('Request key already used')
        return {'user_id':user.id,**link_status(old)}
    role=db.query(Role).filter_by(name=body.role).one_or_none()
    if not role or body.role not in {'staff','finance'}:fail('Choose a supported operational role',400)
    if db.query(User).filter(func.lower(User.email)==email).first():fail('Account already exists; review it before issuing a replacement')
    from app.models.role_permission import RolePermission
    from app.models.permission import Permission
    role_codes=set(db.scalars(select(Permission.code).join(RolePermission,RolePermission.permission_id==Permission.id).where(RolePermission.role_id==role.id)))
    if not role_codes<=permissions(db,actor):fail('Role includes access beyond your authority',403)
    user=User(email=email,role_id=role.id,is_active=True,password_hash=None)
    db.add(user);db.flush();audit(db,actor,'staff_invited',user.id)
    row,token=issue(db,user,'staff',body.request_key,actor)
    deliver_link(db,row,token)
    return {'user_id':user.id,**link_status(row)}


def consume(db,token,password,purpose):
    invalid=lambda:fail('This private link is invalid or expired. Request a replacement.',400)
    row=db.get(AccountLink,digest(token))
    if not row:invalid()
    user=lock_user(db,row.user_id)
    db.refresh(row,with_for_update=True)
    if row.purpose!=purpose or row.consumed_at or row.revoked_at or aware(row.expires_at)<=now() or not user.is_active:invalid()
    if purpose=='staff' and (user.password_hash or not user.role or user.role.name not in {'staff','finance'}):invalid()
    if len(password)<12 or len(password.encode('utf8'))>72:fail('Use 12 characters to 72 UTF-8 bytes',400)
    user.password_hash=hash_password(password);row.consumed_at=now()
    db.execute(update(AccountLink).where(AccountLink.user_id==user.id,AccountLink.token_hash!=row.token_hash,AccountLink.consumed_at.is_(None),AccountLink.revoked_at.is_(None)).values(revoked_at=now()))
    # Password reset also invalidates any outstanding original membership setup.
    from app.models.membership import PasswordSetupInvitation
    db.execute(update(PasswordSetupInvitation).where(PasswordSetupInvitation.user_id==user.id,PasswordSetupInvitation.consumed_at.is_(None),PasswordSetupInvitation.revoked_at.is_(None)).values(revoked_at=now()))
    revoke_all(db,user.id);audit(db,user,purpose+'_password_set_sessions_revoked')
    notify(db,user.id,'account-link:'+row.token_hash,'Your password was changed. Existing sessions were signed out.','dashboard')
    db.commit()


def recover(db,email,key):
    # Equal bcrypt work for present/missing/inactive accounts; generic response.
    verify_password('recovery-timing-work',DUMMY_HASH)
    candidates=db.query(User).filter(func.lower(User.email)==email.strip().lower()).all()
    if len(candidates)!=1 or not candidates[0].is_active or not candidates[0].password_hash:return
    row,token=issue(db,candidates[0],'recovery',key)
    deliver_link(db,row,token)


def enqueue_recovery(db,email,key):
    # Identical public path for every address, including missing/suspended accounts.
    # Provider I/O and account lookup happen only in the separate worker.
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert=pg_insert if db.bind.dialect.name=='postgresql' else sqlite_insert
    db.execute(insert(RecoveryRequest).values(request_key=str(key),email_hash=digest(email.strip().lower()),state='Pending').on_conflict_do_nothing(index_elements=['request_key']))
    db.commit()


def process_recovery(db):
    job=db.execute(select(RecoveryRequest).where(RecoveryRequest.state=='Pending').order_by(RecoveryRequest.created_at).limit(1).with_for_update(skip_locked=True)).scalars().first()
    if not job:return False
    # Claim before SMTP; a crash cannot replay sending. A new recovery request
    # produces a replacement and revokes any earlier link.
    job.state='Claimed';key=job.request_key;email_hash=job.email_hash;db.commit()
    users=db.query(User).filter(User.is_active.is_(True),User.password_hash.is_not(None)).all()
    candidates=[u for u in users if digest(u.email.strip().lower())==email_hash]
    if len(candidates)==1:recover(db,candidates[0].email,key)
    job=db.get(RecoveryRequest,key);job.state='Completed';db.commit()
    return True


def notify(db,user_id,key,message,screen):
    if not user_id:return
    # Unique event+recipient identity is the transactional outbox deduplication key.
    key=str(user_id)+':'+key
    values=dict(user_id=user_id,event_key=key,message=message,screen=screen,read=False,delivery_state='Not requested',delivery_attempts=0)
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert=pg_insert if db.bind.dialect.name=='postgresql' else sqlite_insert
    db.execute(insert(Notification).values(**values).on_conflict_do_nothing(index_elements=['event_key']))


def member_notice(db,member_id,key,message,screen):
    member=db.get(Member,member_id)
    if member:notify(db,member.user_id,key,message,screen)


def send_notice(db,actor,row):
    access.guard(db,actor)
    row=db.execute(select(Notification).where(Notification.id==row.id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    if row.delivery_state in {'Mailpit accepted','Sending','Uncertain'}:return
    user=db.get(User,row.user_id)
    if not user.is_active:fail('Recipient is suspended')
    mailer=get_invitation_mailer()
    if not mailer.available:row.delivery_state='Unavailable';db.commit();return
    from app.services.business_settings import public_contacts
    contacts=public_contacts(db)
    row.delivery_state='Sending';row.delivery_attempts+=1
    audit(db,actor,'notification_delivery_attempt',row.id,table='notifications')
    db.commit()
    try:
        mailer.send_notice(recipient=user.email,notification_id=row.id,contacts=contacts)
        row.delivery_state='Mailpit accepted'
    except DeliveryNotSubmitted:
        row.delivery_state='Failed before submission'
    except Exception:
        row.delivery_state='Uncertain'
    db.commit()
