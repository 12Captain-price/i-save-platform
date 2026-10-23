"""Real HTTP/session boundaries; synthetic PostgreSQL/SQLite data only."""
from datetime import timedelta
from uuid import uuid4
from unittest.mock import Mock
import pytest
from sqlalchemy import select
from app.models.account_workflows import AccountLink, Notification, RecoveryRequest
from app.models.auth import AuthSession, UserPermission
from app.models.permission import Permission
from app.models.user import User
from app.models.audit_event import AuditEvent
from app.security.auth import now, digest, permissions
from app.security.hashing import hash_password, verify_password
from app.services import account_workflows as service
from app.exceptions import APIError
from tests.test_auth import accounts, headers, PASSWORD


@pytest.fixture
def mailer(monkeypatch):
    adapter=Mock(available=True)
    monkeypatch.setattr(service,'get_invitation_mailer',lambda:adapter)
    return adapter


def invite(client,db,accounts,**extra):
    body={'email':'invited@example.test','role':'staff','request_key':str(uuid4()),**extra}
    response=client.post('/api/v1/admin/staff/invitations',headers=headers(db,accounts['administrator']),json=body)
    return response,body


def test_staff_invite_hashed_idempotent_and_single_use(client,db,accounts,mailer):
    before=db.query(User).count()
    r,body=invite(client,db,accounts)
    assert r.status_code==200 and r.json()['delivery_state']=='Mailpit accepted'
    token=mailer.send_account.call_args.kwargs['token']
    assert token not in r.text and 'token_hash' not in r.text
    assert db.get(AccountLink,digest(token))
    assert db.query(User).count()==before+1
    assert client.post('/api/v1/admin/staff/invitations',headers=headers(db,accounts['administrator'],'repeat'),json=body).status_code==200
    assert mailer.send_account.call_count==1
    payload={'token':token,'password':PASSWORD}
    assert client.post('/api/v1/auth/setup-password',json=payload).status_code==204
    user=db.query(User).filter_by(email=body['email']).one()
    assert verify_password(PASSWORD,user.password_hash)
    assert client.post('/api/v1/auth/setup-password',json=payload).status_code==400
    assert db.query(AuditEvent).filter_by(action='staff_password_set_sessions_revoked').count()==1
    assert db.query(AuthSession).filter_by(user_id=user.id,revoked_at=None).count()==0


@pytest.mark.parametrize('role',['member','staff','finance'])
def test_staff_admin_denied(client,db,accounts,role):
    h=headers(db,accounts[role])
    assert client.get('/api/v1/admin/staff',headers=h).status_code==403
    assert client.post('/api/v1/admin/staff/invitations',headers=h,json={'email':'denied@example.test','role':'staff','request_key':str(uuid4())}).status_code==403


def test_existing_account_no_mutation(client,db,accounts,mailer):
    r,_=invite(client,db,accounts,email=accounts['staff'].email)
    assert r.status_code==409 and not mailer.send_account.called
    assert db.query(AccountLink).count()==0


def test_failed_delivery_requires_replacement_and_revokes_old(client,db,accounts,mailer):
    mailer.send_account.side_effect=RuntimeError('private provider content')
    r,body=invite(client,db,accounts)
    assert r.status_code==200 and r.json()['delivery_state']=='Failed or uncertain'
    token=mailer.send_account.call_args.kwargs['token']
    identifier=r.json()['user_id']
    mailer.send_account.side_effect=None
    r=client.post(f'/api/v1/admin/staff/{identifier}/invitation',headers=headers(db,accounts['administrator'],'replace'),json={'request_key':str(uuid4())})
    assert r.status_code==200
    assert db.get(AccountLink,digest(token)).revoked_at
    assert client.post('/api/v1/auth/setup-password',json={'token':token,'password':PASSWORD}).status_code==400
    assert db.query(User).filter_by(email=body['email']).count()==1


def test_recovery_acknowledgement_and_no_inline_account_lookup(client,db,accounts,mailer):
    accounts['member'].password_hash=hash_password(PASSWORD);db.commit()
    bodies=[]
    for email in ['member@example.test','missing@example.test','staff@example.test']:
        r=client.post('/api/v1/auth/recovery',json={'email':email,'request_key':str(uuid4())})
        assert r.status_code==202;bodies.append(r.json())
    assert bodies[0]==bodies[1]==bodies[2] and not mailer.send_account.called
    assert db.query(RecoveryRequest).count()==3
    while service.process_recovery(db):pass
    assert mailer.send_account.call_count==1


def test_recovery_consumption_revokes_sessions_preserves_role(client,db,accounts,mailer):
    user=accounts['member'];user.password_hash=hash_password(PASSWORD);db.commit()
    h=headers(db,user)
    role=user.role_id;codes=permissions(db,user)
    service.recover(db,user.email,uuid4())
    token=mailer.send_account.call_args.kwargs['token']
    payload={'token':token,'password':'Different-secure-test-456!'}
    assert client.post('/api/v1/auth/reset-password',json=payload).status_code==204
    assert client.get('/api/v1/auth/me',headers=h).status_code==401
    assert user.role_id==role and permissions(db,user)==codes
    assert client.post('/api/v1/auth/reset-password',json=payload).status_code==400
    assert db.query(Notification).filter_by(user_id=user.id).count()==1


@pytest.mark.parametrize('state',['expired','revoked','suspended','wrong-purpose'])
def test_invalid_links_do_not_change_password(client,db,accounts,mailer,state):
    user=accounts['member'];user.password_hash=hash_password(PASSWORD);db.commit()
    service.recover(db,user.email,uuid4());token=mailer.send_account.call_args.kwargs['token']
    row=db.get(AccountLink,digest(token));before=user.password_hash
    if state=='expired':row.expires_at=now()-timedelta(seconds=1)
    if state=='revoked':row.revoked_at=now()
    if state=='suspended':user.is_active=False
    if state=='wrong-purpose':row.purpose='staff'
    db.commit()
    assert client.post('/api/v1/auth/reset-password',json={'token':token,'password':'Different-secure-test-456!'}).status_code==400
    assert user.password_hash==before


def test_recovery_replacement_and_rate_limit(client,db,accounts,mailer):
    user=accounts['member'];user.password_hash=hash_password(PASSWORD);db.commit()
    service.recover(db,user.email,uuid4());first=mailer.send_account.call_args.kwargs['token']
    service.recover(db,user.email,uuid4());assert db.get(AccountLink,digest(first)).revoked_at
    for _ in range(10):assert client.post('/api/v1/auth/recovery',json={'email':'missing@example.test','request_key':str(uuid4())}).status_code==202
    assert client.post('/api/v1/auth/recovery',json={'email':'missing@example.test','request_key':str(uuid4())}).status_code==429


def test_staff_suspension_and_live_permissions(client,db,accounts):
    admin=headers(db,accounts['administrator']);staff=headers(db,accounts['staff'])
    identifier=accounts['staff'].id
    assert client.put(f'/api/v1/admin/staff/{identifier}/permissions/members:read',headers=admin,json={'allowed':False}).status_code==200
    assert client.get('/api/v1/auth/me',headers=staff).status_code==401
    staff=headers(db,accounts['staff'],'fresh')
    assert client.get('/api/v1/members',headers=staff).status_code==403
    assert client.put(f'/api/v1/admin/staff/{identifier}/status',headers=admin,json={'active':False}).status_code==200
    assert client.get('/api/v1/auth/me',headers=staff).status_code==401
    assert not db.get(User,identifier).is_active


def test_self_and_authority_checks(client,db,accounts):
    admin=accounts['administrator'];h=headers(db,admin)
    assert client.put(f'/api/v1/admin/staff/{admin.id}/status',headers=h,json={'active':False}).status_code==403
    assert client.put(f'/api/v1/admin/staff/{admin.id}/permissions/members:write',headers=h,json={'allowed':True}).status_code==403
    p=db.query(Permission).filter_by(code='members:write').one()
    db.add(UserPermission(user_id=admin.id,permission_id=p.id,allowed=False));db.commit()
    assert client.put(f'/api/v1/admin/staff/{accounts["staff"].id}/permissions/members:write',headers=h,json={'allowed':True}).status_code==403
    p=db.query(Permission).filter_by(code='members:read').one()
    db.add(UserPermission(user_id=admin.id,permission_id=p.id,allowed=False))
    db.add(UserPermission(user_id=accounts['staff'].id,permission_id=p.id,allowed=False));db.commit()
    assert client.put(f'/api/v1/admin/staff/{accounts["staff"].id}/permissions/members:read',headers=h,json={'allowed':None}).status_code==403


def test_notifications_owned_deduplicated_and_current_permissions(client,db,accounts):
    member=accounts['member'];other=accounts['other']
    service.notify(db,member.id,'completed-1','Contribution status: Confirmed.','contributions')
    service.notify(db,member.id,'completed-1','Duplicate must not replace original','contributions');db.commit()
    h=headers(db,member);foreign=headers(db,other)
    data=client.get('/api/v1/notifications',headers=h).json()
    assert data['unread']==1 and len(data['items'])==1
    item=data['items'][0];assert item['link']=='/portal/member/contributions'
    assert client.put('/api/v1/notifications/'+str(item['id']),headers=foreign,json={'read':True}).status_code==404
    assert client.put('/api/v1/notifications/'+str(item['id']),headers=h,json={'read':True}).status_code==200
    assert client.get('/api/v1/notifications',headers=h).json()['unread']==0
    assert client.get('/api/v1/admin/notification-deliveries',headers=h).status_code==403
    p=db.query(Permission).filter_by(code='savings:own').one();db.add(UserPermission(user_id=member.id,permission_id=p.id,allowed=False));db.commit()
    assert client.get('/api/v1/notifications',headers=h).json()['items'][0]['link'] is None


def test_notification_failure_does_not_repeat_event(db,accounts,mailer):
    service.notify(db,accounts['member'].id,'event-1','Update available','dashboard');db.commit()
    row=db.query(Notification).one();mailer.send_notice.side_effect=RuntimeError('private')
    service.send_notice(db,accounts['administrator'],row)
    assert row.delivery_state=='Uncertain'
    service.send_notice(db,accounts['administrator'],row)
    assert mailer.send_notice.call_count==1 and db.query(Notification).count()==1


def test_actor_spoofing_rejected(client,db,accounts):
    r,_=invite(client,db,accounts,issued_by=accounts['staff'].id)
    assert r.status_code==400 and db.query(AccountLink).count()==0


def test_delivery_history_and_authorised_replacement_hide_private_tokens(client,db,accounts,mailer):
    response,_=invite(client,db,accounts)
    token=mailer.send_account.call_args.kwargs['token']
    admin=headers(db,accounts['administrator'],'delivery-admin')
    page=client.get('/api/v1/admin/notification-deliveries',headers=admin)
    assert page.status_code==200 and page.json()['link_total']==1
    assert token not in page.text and digest(token) not in page.text
    key=page.json()['links'][0]['request_key']
    path=f'/api/v1/admin/account-links/{key}/replace'
    assert client.post(path,headers=headers(db,accounts['member']),json={'request_key':str(uuid4())}).status_code==403
    r=client.post(path,headers=admin,json={'request_key':str(uuid4())})
    assert r.status_code==200 and db.get(AccountLink,digest(token)).revoked_at
    assert token not in r.text


def test_legacy_provisioning_cannot_bypass_grant_authority(client,db,accounts):
    admin=accounts['administrator'];p=db.query(Permission).filter_by(code='members:write').one()
    db.add(UserPermission(user_id=admin.id,permission_id=p.id,allowed=False));db.commit()
    h=headers(db,admin)
    r=client.post('/api/v1/users',headers=h,json={'email':'escalation@example.test','password':PASSWORD,'role_id':admin.role_id})
    assert r.status_code==403 and not db.query(User).filter_by(email='escalation@example.test').first()
    assert client.patch(f'/api/v1/users/{accounts["staff"].id}',headers=h,json={'role_id':admin.role_id}).status_code==403


def test_suspension_revokes_invitation_even_after_restore(client,db,accounts,mailer):
    r,_=invite(client,db,accounts);identifier=r.json()['user_id'];token=mailer.send_account.call_args.kwargs['token']
    h=headers(db,accounts['administrator'],'suspend-link')
    for active in [False,True]:
        assert client.put(f'/api/v1/admin/staff/{identifier}/status',headers=h,json={'active':active}).status_code==200
    assert db.get(AccountLink,digest(token)).revoked_at
    assert client.post('/api/v1/auth/setup-password',json={'token':token,'password':PASSWORD}).status_code==400


def test_password_change_revokes_pending_recovery(client,db,accounts,mailer):
    user=accounts['member'];user.password_hash=hash_password(PASSWORD);db.commit()
    service.recover(db,user.email,uuid4());token=mailer.send_account.call_args.kwargs['token']
    r=client.post('/api/v1/auth/password',headers=headers(db,user),json={'current_password':PASSWORD,'new_password':'Synthetic-replacement-456!'})
    assert r.status_code==204 and db.get(AccountLink,digest(token)).revoked_at
    assert client.post('/api/v1/auth/reset-password',json={'token':token,'password':PASSWORD}).status_code==400


def test_failed_before_smtp_submission_can_retry_without_repeating_event(db,accounts,mailer):
    from app.services.invitation_delivery import DeliveryNotSubmitted
    service.notify(db,accounts['member'].id,'smtp-retry-event','Recorded update','dashboard');db.commit()
    row=db.query(Notification).one();mailer.send_notice.side_effect=DeliveryNotSubmitted()
    service.send_notice(db,accounts['administrator'],row)
    assert row.delivery_state=='Failed before submission' and row.delivery_attempts==1
    mailer.send_notice.side_effect=None
    service.send_notice(db,accounts['administrator'],row)
    assert row.delivery_state=='Mailpit accepted' and row.delivery_attempts==2
    assert db.query(Notification).count()==1
