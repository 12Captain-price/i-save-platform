"""Transaction-safe agreed membership workflow. Fees never enter contributions."""
import hashlib,json,secrets
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from sqlalchemy import select,func,text,update
from app.config import get_settings
from app.exceptions import APIError,not_found
from app.models.application import MembershipApplication,ApplicationEvent
from app.models.membership import ApplicationRegistrationPayment as Payment,MembershipApproval as Approval,PasswordSetupInvitation as Invitation
from app.models.member import Member
from app.models.user import User
from app.models.role import Role
from app.models.registration_fee import RegistrationFee
from app.models.subscription import Subscription
from app.models.audit_event import AuditEvent
from app.security.auth import now,aware,digest,permissions,validate_session,unauthenticated
from app.security.hashing import hash_password
from app.services.auth import revoke_all
from app.membership_policy import POLICY
from app.services.business_settings import active, application_policy, acknowledgement
from app.models.business_settings import ApplicationSettingsSnapshot, SubscriptionSettingsSnapshot
from datetime import date
from app.models.fee_currency import FeeObligation
from app.services import fee_currency


def advisory(db,value):
    if db.bind.dialect.name=='postgresql':
        key=int.from_bytes(hashlib.sha256(value.encode()).digest()[:8],'big',signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'),{'key':key})


def reference_lock(db,reference):
    advisory(db,'registration-receipt:'+reference.strip().lower())


def lock_application(db,application_id):
    if db.bind.dialect.name=='sqlite':
        db.execute(update(MembershipApplication).where(MembershipApplication.id==application_id).values(id=MembershipApplication.id,updated_at=MembershipApplication.updated_at))
    app=db.execute(select(MembershipApplication).where(MembershipApplication.id==application_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not app:raise not_found('Application not found')
    return app


def lock_actor(db,actor,session,capability):
    db.refresh(actor,with_for_update=True);db.refresh(session,with_for_update=True);validate_session(session)
    if not actor.is_active:raise unauthenticated()
    if capability not in permissions(db,actor):raise APIError(403,'forbidden','Permission required')


def event(db,actor,action,app,note,details=None):
    db.add(AuditEvent(event_type='membership',actor_user_id=actor.id,actor_email=actor.email,action=action,target_table='membership_applications',target_id=str(app.id),details=json.dumps(details) if details else None))
    db.add(ApplicationEvent(application_id=app.id,status=app.status,actor_user_id=actor.id,note=note))


def check_pending(app):
    if app.status not in {'Pending','Submitted'} or app.member_id is not None:
        raise APIError(409,'conflict','This application requires reconciliation before changing its payment or membership')


def verified(payment, db=None):
    if not payment:return False
    obligation=db.query(FeeObligation).filter_by(application_id=payment.application_id).one_or_none() if db is not None else None
    if obligation:return bool(payment.verified_at and payment.verified_by and fee_currency.matches(obligation,payment.amount,payment.currency))
    terms = application_policy(db,payment.application_id)[1] if db is not None else {'registration_amount':'20.00','registration_currency':'USD'}
    return bool(payment.verified_at and payment.verified_by and payment.amount==Decimal(terms['registration_amount']) and payment.currency==terms['registration_currency'])


def registration_obligation(db,actor,application_id):
    app=lock_application(db,application_id)
    old=db.query(FeeObligation).filter_by(application_id=app.id).one_or_none()
    if old:return old
    payment=db.get(Payment,app.id)
    if not payment:check_pending(app)
    version,terms=application_policy(db,app.id)
    if version and not db.get(ApplicationSettingsSnapshot,app.id):
        db.add(ApplicationSettingsSnapshot(application_id=app.id,version_id=version));db.flush()
    return fee_currency.create_obligation(db,actor,Decimal(terms['registration_amount']),terms['registration_currency'],application_id=app.id,at=payment.recorded_at if payment else None,legacy=bool(payment))


def record_payment(db,actor,application_id,body):
    app=lock_application(db,application_id);reference_lock(db,body.reference)
    payment=db.get(Payment,app.id)
    if payment:
        if (payment.amount,payment.currency,payment.payment_date,payment.reference.lower())==(body.amount,body.currency,body.payment_date,body.reference.lower()):return
        raise APIError(409,'conflict','A payment is already recorded; corrections/refunds require an approved procedure')
    check_pending(app)
    obligation=db.query(FeeObligation).filter_by(application_id=app.id).one_or_none()
    if not obligation:
        # Native-currency compatibility; converted settlement always requires a persisted preview first.
        _,terms=application_policy(db,app.id)
        if body.currency!=terms['registration_currency'] or body.amount!=Decimal(terms['registration_amount']):
            raise APIError(409 if body.currency=='ZWG' else 400,'obligation_required','Create and review the fee obligation before converted payment')
        obligation=registration_obligation(db,actor,app.id)
    fee_currency.validate_payment(obligation,body.amount,body.currency)
    if body.payment_date>now().astimezone(ZoneInfo('Africa/Harare')).date():raise APIError(400,'bad_request','Payment date cannot be in the future')
    key=digest(body.reference.lower())
    fee_currency.check_reference(db,body.reference)
    db.add(Payment(application_id=app.id,reference=body.reference,reference_key=key,amount=body.amount,currency=body.currency,payment_date=body.payment_date,recorded_by=actor.id,recorder_email=actor.email))
    event(db,actor,'registration_fee_recorded',app,'Registration fee payment recorded; awaiting verification.',{'amount':str(body.amount),'currency':body.currency,'reference':body.reference,'payment_date':str(body.payment_date)})


def verify_payment(db,actor,application_id):
    app=lock_application(db,application_id);payment=db.get(Payment,app.id)
    if not payment:raise APIError(409,'conflict','Record the registration payment first')
    if payment.verified_at:return
    check_pending(app)
    obligation=db.query(FeeObligation).filter_by(application_id=app.id).one_or_none()
    if obligation:fee_currency.validate_payment(obligation,payment.amount,payment.currency)
    else:
        _,terms=application_policy(db,app.id)
        if payment.amount!=Decimal(terms['registration_amount']) or payment.currency!=terms['registration_currency']:raise APIError(409,'conflict','Payment does not match its recorded fee policy')
    payment.verified_by=actor.id;payment.verifier_email=actor.email;payment.verified_at=now()
    event(db,actor,'registration_fee_verified',app,'Registration fee verified as a separate explicit action.',{'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':str(payment.payment_date),'recorded_by':payment.recorded_by,'verified_by':actor.id})


def approve(db,actor,application_id):
    app=lock_application(db,application_id)
    if db.get(Approval,app.id):return
    check_pending(app);payment=db.get(Payment,app.id)
    from app.services.evidence import approval_blockers
    document_blockers = approval_blockers(db, app.id)
    if document_blockers:raise APIError(409,'prerequisite_missing','; '.join(document_blockers))
    if not verified(payment,db):raise APIError(409,'prerequisite_missing','A verified registration fee is required')
    email=app.email.strip().lower();advisory(db,'membership-email:'+email)
    if db.query(User).filter(func.lower(User.email)==email).first():raise APIError(409,'conflict','Account linking requires administrator reconciliation')
    role=db.query(Role).filter_by(name='member').one_or_none()
    if not role:raise APIError(503,'unconfigured','Canonical member role must be configured')
    user=User(email=email,role_id=role.id,is_active=False,password_hash=None);db.add(user);db.flush()
    member=Member(member_number='MEM-'+secrets.token_hex(12),user_id=user.id,first_name=app.first_name,last_name=app.last_name,email=app.email,phone=app.phone,address=app.address)
    db.add(member);db.flush()
    version,terms=application_policy(db,app.id);ack=acknowledgement(terms,version)
    db.add(Approval(application_id=app.id,member_id=member.id,user_id=user.id,approved_by=actor.id,approver_email=actor.email,approved_at=now(),acknowledgement_version=ack['acknowledgement_version'],acknowledgement_text=ack['acknowledgement']))
    app.member_id=member.id;app.status='Approved';app.reviewed_by=actor.id;app.reviewed_at=now()
    event(db,actor,'membership_approved',app,'Membership approved after verified fee confirmation. Account remains inactive; payment will be linked during activation.',{'member_id':member.id,'user_id':user.id})


def activate(db,actor,application_id):
    app=lock_application(db,application_id);approval=db.get(Approval,app.id)
    if not approval:raise APIError(409,'prerequisite_missing','Approve membership first')
    if approval.activated_at:return
    payment=db.get(Payment,app.id)
    if not verified(payment,db) or payment.member_id not in {None,approval.member_id}:raise APIError(409,'prerequisite_missing','Verified registration fee is required')
    user=db.execute(select(User).where(User.id==approval.user_id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    if not user.role or user.role.name!='member':raise APIError(409,'conflict','Account role requires reconciliation')
    timestamp=now();local=timestamp.astimezone(ZoneInfo('Africa/Harare'))
    year,month=(local.year+1,1) if local.month==12 else (local.year,local.month+1)
    period=f'{year:04d}-{month:02d}'
    approval.activated_at=timestamp;approval.activated_by=actor.id;approval.activator_email=actor.email;approval.subscription_start_month=period
    user.is_active=True;db.get(Member,approval.member_id).joined_at=timestamp;app.status='Activated';payment.member_id=approval.member_id
    version,terms=active(db)
    subscription=Subscription(subscription_reference=f'SUB-{approval.member_id}-{period}',member_id=approval.member_id,period_month=period,amount=Decimal(terms['subscription_amount']),currency=terms['subscription_currency'],status='Pending',due_date=date(year,month,terms['subscription_due_day']) if terms['subscription_due_day'] else None)
    db.add(subscription);db.flush()
    if version:db.add(SubscriptionSettingsSnapshot(subscription_id=subscription.id,version_id=version))
    fee_currency.create_obligation(db,actor,subscription.amount,subscription.currency,subscription_id=subscription.id,at=timestamp)
    event(db,actor,'account_activated',app,'Member account activated and existing verified registration payment linked. First subscription recorded for the following calendar month.',{'subscription_start_month':period,'payment_reference':payment.reference,'amount':str(payment.amount),'currency':payment.currency,'subscription_settings_version':version})


def workflow(db,actor,application_id,mailer_available=False):
    app=db.get(MembershipApplication,application_id)
    if not app:raise not_found('Application not found')
    payment=db.get(Payment,app.id);approval=db.get(Approval,app.id);codes=permissions(db,actor)
    subscription_due_day=active(db)[1]['subscription_due_day']
    if approval and approval.activated_at:
        obligation=db.query(Subscription).filter_by(member_id=approval.member_id,period_month=approval.subscription_start_month).one_or_none()
        subscription_due_day=obligation.due_date.day if obligation and obligation.due_date and db.get(SubscriptionSettingsSnapshot,obligation.id) else None
    blockers=[]
    from app.services.evidence import approval_blockers
    blockers.extend(approval_blockers(db, app.id))
    if 'membership:approve' not in codes:blockers.append('Membership approval permission required.')
    version,terms=application_policy(db,app.id)
    if not verified(payment,db):blockers.append('The registration fee must be verified against its configured amount and currency.')
    if app.status not in {'Pending','Submitted'} or app.member_id is not None:blockers.append('Application is no longer an unlinked pending membership application.')
    if not approval and db.query(User).filter(func.lower(User.email)==app.email.strip().lower()).first():blockers.append('Account linking requires administrator reconciliation.')
    if not db.query(Role).filter_by(name='member').first():blockers.append('Canonical member role must be configured.')
    invites=db.query(Invitation).filter_by(application_id=app.id).order_by(Invitation.issued_at.desc()).all()
    latest=invites[0] if invites else None
    return {'payment':None if not payment else {'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':payment.payment_date,'recorded_by':payment.recorder_email,'recorded_at':payment.recorded_at,'verified_by':payment.verifier_email,'verified_at':payment.verified_at,'status':'Verified' if payment.verified_at else 'Recorded - awaiting verification'},
        'approval':None if not approval else {'approved_by':approval.approver_email,'approved_at':approval.approved_at,'acknowledgement_version':approval.acknowledgement_version,'acknowledgement_text':approval.acknowledgement_text,'activated_at':approval.activated_at,'activated_by':approval.activator_email,'subscription_start_month':approval.subscription_start_month},
        'can_approve':not blockers,'approval_blockers':blockers,'acknowledgement':acknowledgement(terms,version),
        'fee_policy':{'amount':terms['registration_amount'],'currency':terms['registration_currency'],'settings_version':version},
        'fee_obligation':fee_currency.quote(db,db.query(FeeObligation).filter_by(application_id=app.id).one_or_none()),
        'can_verify':bool(payment and not payment.verified_at and 'registration-fees:verify' in codes),
        'same_employee_verification_allowed':True,
        'delivery':{'available':mailer_available,'status':latest.delivery_state if latest else 'Not issued','provider_message_id':latest.provider_message_id if latest else None,'expires_at':latest.expires_at if latest else None},
        'refund_policy':'Unconfigured','subscription_due_day':subscription_due_day}


def create_invitation(db,actor,application_id,request_key):
    app=lock_application(db,application_id);approval=db.get(Approval,app.id)
    if not approval or not approval.activated_at:raise APIError(409,'prerequisite_missing','Account activation is required before password setup')
    user=db.execute(select(User).where(User.id==approval.user_id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    if not user.is_active or not user.role or user.role.name!='member' or user.password_hash:raise APIError(409,'conflict','Password setup is not available for this account')
    db.execute(update(Invitation).where(Invitation.user_id==user.id,Invitation.consumed_at.is_(None),Invitation.revoked_at.is_(None)).values(revoked_at=now()))
    token=secrets.token_urlsafe(32);invitation=Invitation(token_hash=digest(token),application_id=app.id,user_id=user.id,request_key=str(request_key),issued_by=actor.id,expires_at=now()+timedelta(minutes=get_settings().password_setup_expire_minutes),delivery_state='Not sent')
    db.add(invitation);db.flush();event(db,actor,'password_setup_invitation_issued',app,'Expiring, single-use password setup invitation issued; no delivery claim.')
    return token,invitation


def consume_invitation(db,token,password):
    invitation=db.get(Invitation,digest(token))
    invalid=lambda:APIError(400,'invalid_invitation','This password setup link is invalid or expired. Contact the office.')
    if not invitation:raise invalid()
    app=lock_application(db,invitation.application_id)
    user=db.execute(select(User).where(User.id==invitation.user_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    db.refresh(invitation,with_for_update=True)
    if not user or invitation.consumed_at or invitation.revoked_at or aware(invitation.expires_at)<=now() or not user.is_active or user.password_hash or not user.role or user.role.name!='member':raise invalid()
    invitation.consumed_at=now();user.password_hash=hash_password(password);revoke_all(db,user.id)
    event(db,user,'password_setup_completed',app,'Single-use password setup completed; no automatic login or membership change.')
