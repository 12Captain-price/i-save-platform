"""Agreed fee gate, independent permissions, durable links and private setup."""
from datetime import date,timedelta,datetime,timezone
from uuid import uuid4
import pytest
from app.models.application import MembershipApplication,ApplicationEvent
from app.models.membership import ApplicationRegistrationPayment as Payment,MembershipApproval as Approval,PasswordSetupInvitation as Invitation
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.subscription import Subscription
from app.models.contribution import Contribution
from app.models.user import User
from app.models.audit_event import AuditEvent
from app.membership_policy import POLICY
from app.security.auth import now,digest
from app.services import membership
from app.services.invitation_delivery import get_invitation_mailer
from app.main import app
from tests.test_auth import accounts,headers

BASE='/api/v1/membership/applications/'
ACK={'acknowledged':True,'acknowledgement_version':POLICY['acknowledgement_version']}
PAY={'amount':'20.00','currency':'USD','payment_date':'2026-01-01','reference':'Synthetic-receipt'}

@pytest.fixture
def pending(db,accounts):
    row=MembershipApplication(application_number='synthetic-pending',first_name='Synthetic',last_name='Applicant',email='pending@example.test',status='Pending')
    db.add(row);db.commit();return row

def grant(db,user,*codes):
    for code in codes:
        db.add(UserPermission(user_id=user.id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit()

def post(client,auth,row,action,body=None):
    return client.post(f'{BASE}{row.id}/{action}',headers=auth,json=body if body is not None else {})

def prepare(client,db,accounts,pending):
    auth=headers(db,accounts['administrator'])
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,'verify').status_code==200
    return auth

@pytest.mark.parametrize('role',['member','other','staff','finance'])
@pytest.mark.parametrize('action,body',[('payment',PAY),('verify',{}),('approve',ACK),('activate',{}),('invitation',{'request_key':str(uuid4())})])
def test_ungranted_actions_denied(client,db,accounts,pending,role,action,body):
    assert post(client,headers(db,accounts[role]),pending,action,body).status_code==403
    assert db.query(Payment).count()==db.query(Approval).count()==0

def test_same_employee_with_both_permissions_can_record_and_verify(client,db,accounts,pending):
    staff=accounts['staff'];grant(db,staff,'registration-fees:record','registration-fees:verify')
    auth=headers(db,staff)
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert db.get(Payment,pending.id).verified_at is None
    assert post(client,auth,pending,'verify').status_code==200
    p=db.get(Payment,pending.id)
    assert p.recorded_by==p.verified_by==staff.id and p.recorded_at and p.verified_at
    assert len(db.query(AuditEvent).filter(AuditEvent.action.in_(['registration_fee_recorded','registration_fee_verified'])).all())==2

@pytest.mark.parametrize('code,allowed,denied',[('registration-fees:record','payment','verify'),('registration-fees:verify','verify','payment')])
def test_permissions_are_independent(client,db,accounts,pending,code,allowed,denied):
    grant(db,accounts['staff'],code);auth=headers(db,accounts['staff'])
    if allowed=='verify':
        assert post(client,headers(db,accounts['administrator']),pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,allowed,PAY if allowed=='payment' else {}).status_code==200
    assert post(client,auth,pending,denied,PAY if denied=='payment' else {}).status_code==403

@pytest.mark.parametrize('role,action,code',[('member','payment','registration-fees:record'),('member','verify','registration-fees:verify'),('finance','approve','membership:approve'),('finance','activate','membership:activate')])
def test_role_boundary_cannot_be_overridden(client,db,accounts,pending,role,action,code):
    grant(db,accounts[role],code)
    assert post(client,headers(db,accounts[role]),pending,action,PAY if action=='payment' else ACK if action=='approve' else {}).status_code==403

def test_gate_ack_spoofing_duplicates_and_activation(client,db,accounts,pending,monkeypatch):
    auth=headers(db,accounts['administrator'])
    assert post(client,auth,pending,'approve',ACK).status_code==409
    assert db.query(Payment).count()==0
    assert post(client,auth,pending,'payment',{**PAY,'recorded_by':accounts['other'].id}).status_code==400
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,'approve',ACK).status_code==409
    assert post(client,auth,pending,'verify',{'verified_by':accounts['other'].id}).status_code==400
    assert post(client,auth,pending,'verify').status_code==200
    for body in [{},{**ACK,'acknowledged':False},{**ACK,'acknowledged':'true'},{**ACK,'acknowledgement_version':'old'},{**ACK,'actor_id':1}]:
        assert post(client,auth,pending,'approve',body).status_code==400
    before=db.query(Contribution).count()
    for _ in range(2):
        assert post(client,auth,pending,'payment',PAY).status_code==200
        assert post(client,auth,pending,'verify').status_code==200
        assert post(client,auth,pending,'approve',ACK).status_code==200
    approval=db.get(Approval,pending.id);user=db.get(User,approval.user_id)
    assert not user.is_active and user.password_hash is None
    assert db.get(Payment,pending.id).member_id is None
    # General account administration cannot bypass the explicit activation event.
    assert client.patch(f'/api/v1/users/{user.id}',headers=auth,json={'is_active':True}).status_code==409
    monkeypatch.setattr(membership,'now',lambda:datetime(2026,12,31,23,0,tzinfo=timezone.utc))
    for _ in range(2):assert post(client,auth,pending,'activate').status_code==200
    db.refresh(approval)
    assert approval.subscription_start_month=='2027-02' # already January locally
    p=db.get(Payment,pending.id)
    assert p.member_id==approval.member_id and db.query(Payment).count()==1
    subs=db.query(Subscription).filter_by(member_id=approval.member_id).all()
    assert len(subs)==1 and str(subs[0].amount)=='5.00' and subs[0].due_date is None
    assert db.query(Contribution).count()==before
    fees=client.get('/api/v1/membership/fees',headers=headers(db,user)).json()
    assert fees['registration_fees'][0]['reference']==PAY['reference']
    assert fees['registration_fees'][0]['status']=='Paid'
    assert PAY['reference'] not in str(client.get('/api/v1/membership/fees',headers=headers(db,accounts['other'])).json())
    actions=[e.action for e in db.query(AuditEvent).filter_by(target_table='membership_applications',target_id=str(pending.id))]
    for action in ['registration_fee_recorded','registration_fee_verified','membership_approved','account_activated']:assert actions.count(action)==1

def test_receipts_unique_across_applications_and_legacy(client,db,accounts,pending):
    auth=headers(db,accounts['administrator'])
    assert post(client,auth,pending,'payment',{**PAY,'reference':'MEMBER'}).status_code==409
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,'payment',{**PAY,'reference':'different'}).status_code==409
    other=MembershipApplication(application_number='another',first_name='Other',last_name='Applicant',email='new@example.test',status='Pending');db.add(other);db.commit()
    assert post(client,auth,other,'payment',{**PAY,'reference':PAY['reference'].upper()}).status_code==409

@pytest.mark.parametrize('field,value',[('amount','19.99'),('currency','ZWL'),('payment_date','2999-01-01')])
def test_invalid_payment(client,db,accounts,pending,field,value):
    assert post(client,headers(db,accounts['administrator']),pending,'payment',{**PAY,field:value}).status_code in {400,422}
    assert db.query(Payment).count()==0

def test_existing_account_never_promoted(client,db,accounts,pending):
    auth=prepare(client,db,accounts,pending)
    pending.email=accounts['staff'].email;db.commit()
    assert post(client,auth,pending,'approve',ACK).status_code==409
    assert db.query(Approval).count()==0

def test_invitation_delivery_evidence_retry_expiry_and_single_use(client,db,accounts,pending):
    auth=prepare(client,db,accounts,pending)
    assert post(client,auth,pending,'approve',ACK).status_code==200
    assert post(client,auth,pending,'activate').status_code==200
    key={'request_key':str(uuid4())}
    assert post(client,auth,pending,'invitation',key).status_code==503
    assert db.query(Invitation).count()==0
    class Provider:
        available=True
        calls=0
        fail=True
        token=None
        def send(self,**kwargs):
            self.calls+=1;self.token=kwargs['token']
            if self.fail:raise RuntimeError('synthetic failure')
            return 'synthetic-provider-evidence'
    provider=Provider();app.dependency_overrides[get_invitation_mailer]=lambda:provider
    assert post(client,auth,pending,'invitation',key).status_code==503
    assert db.query(Invitation).count()==0
    provider.fail=False
    response=post(client,auth,pending,'invitation',key)
    assert response.status_code==200 and provider.token not in response.text
    assert post(client,auth,pending,'invitation',key).status_code==200 and provider.calls==2
    row=db.query(Invitation).one();assert row.token_hash==digest(provider.token) and row.provider_message_id
    token=provider.token
    row.expires_at=now()-timedelta(seconds=1);db.commit()
    assert client.post('/api/v1/auth/setup-password',json={'token':token,'password':'Synthetic-only-12345!'}).status_code==400
    row.expires_at=now()+timedelta(minutes=5);db.commit()
    assert client.post('/api/v1/auth/setup-password',json={'token':token,'password':'Synthetic-only-12345!'}).status_code==204
    assert client.post('/api/v1/auth/setup-password',json={'token':token,'password':'Synthetic-other-12345!'}).status_code==400
    assert db.query(Payment).count()==db.query(Approval).count()==1
    assert client.post('/api/v1/auth/login',json={'email':pending.email,'password':'Synthetic-only-12345!'}).status_code==200

def test_new_invitation_revokes_previous_and_uniform_invalid(client,db,accounts,pending):
    auth=prepare(client,db,accounts,pending)
    post(client,auth,pending,'approve',ACK);post(client,auth,pending,'activate')
    first,_=membership.create_invitation(db,accounts['administrator'],pending.id,uuid4());db.commit()
    second,_=membership.create_invitation(db,accounts['administrator'],pending.id,uuid4());db.commit()
    response=client.post('/api/v1/auth/setup-password',json={'token':first,'password':'Synthetic-only-12345!'})
    unknown=client.post('/api/v1/auth/setup-password',json={'token':'x'*43,'password':'Synthetic-only-12345!'})
    assert response.status_code==unknown.status_code==400 and response.json()==unknown.json()
    assert client.post('/api/v1/auth/setup-password',json={'token':second,'password':'short'}).status_code==400
