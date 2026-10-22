"""Session-derived overview and consistent member-owned financial records."""
from decimal import Decimal
import pytest
from app.models.user import User
from app.models.member import Member
from app.models.application import MembershipApplication,SavingsInterest
from app.models.membership import MembershipApproval,ApplicationRegistrationPayment
from app.models.subscription import Subscription
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.contribution import Contribution
from tests.test_auth import accounts,headers
from tests.test_membership_workflow import pending,prepare,post,ACK

URL='/api/v1/membership/overview'

def test_anonymous_and_nonmember_denied(client,db,accounts):
    assert client.get(URL).status_code==401
    for role in ['staff','finance','administrator']:
        assert client.get(URL,headers=headers(db,accounts[role])).status_code==403

@pytest.mark.parametrize('code',['members:own','applications:own','fees:own','subscriptions:own'])
def test_each_required_permission_enforced(client,db,accounts,code):
    user=accounts['member']
    db.add(UserPermission(user_id=user.id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=False));db.commit()
    assert client.get(URL,headers=headers(db,user)).status_code==403
    if code in {'fees:own','subscriptions:own'}:
        assert client.get('/api/v1/membership/fees',headers=headers(db,user,token='denied-fee-session')).status_code==403

def test_empty_unlinked_does_not_match_application_email(client,db,accounts):
    user=User(email='unlinked@example.test',role_id=accounts['member'].role_id,is_active=True);db.add(user);db.flush()
    other=db.query(MembershipApplication).filter_by(member_id=accounts['other'].member.id).one()
    other.email=user.email
    db.add(SavingsInterest(application_id=other.id,category='holiday',category_label='PRIVATE HOLIDAY',purpose='Private',notice_version='old',notice_text='Private snapshot'));db.commit()
    data=client.get(URL,headers=headers(db,user)).json()
    assert data['member'] is None and data['membership']['status']=='No member record linked'
    assert data['fees']=={'registration_fees':[],'subscriptions':[]}
    assert data['savings_interests']==[] and data['savings']['available'] is False
    assert 'PRIVATE' not in str(data)

def test_cross_member_selectors_and_legacy_status(client,db,accounts):
    auth=headers(db,accounts['member']);foreign=accounts['other'].member
    app=db.query(MembershipApplication).filter_by(member_id=foreign.id).one()
    db.add(SavingsInterest(application_id=app.id,category='asset',category_label='PRIVATE ASSET',purpose='Private',notice_version='v1',notice_text='Private'));db.commit()
    for query in [f'?member_id={foreign.id}',f'?user_id={accounts["other"].id}','?email=other@example.test']:
        assert client.get(URL+query,headers=auth).status_code==400
        assert client.get('/api/v1/membership/fees'+query,headers=auth).status_code==400
    assert client.get(URL+'/'+str(foreign.id),headers=auth).status_code==404
    data=client.get(URL,headers=auth).json()
    assert data['member']['member_number']=='member' and data['membership']['status']=='Not confirmed'
    assert data['registration_fee_verified'] is False # Legacy Pending is not proof.
    assert data['savings_interests']==[] and 'PRIVATE' not in str(data)
    assert data['fees']==client.get('/api/v1/membership/fees',headers=auth).json()

def test_activated_snapshot_fee_subscription_and_unreliable_savings(client,db,accounts,pending):
    auth=prepare(client,db,accounts,pending)
    db.add(SavingsInterest(application_id=pending.id,category='education',category_label='Education',purpose='Historical education purpose',notice_version='historical-v1',notice_text='Historical notice, no approved plan terms.'));db.commit()
    assert post(client,auth,pending,'approve',ACK).status_code==200
    assert post(client,auth,pending,'activate').status_code==200
    approval=db.get(MembershipApproval,pending.id);member=db.get(User,approval.user_id)
    for currency,amount,status in [('USD','123.45','Verified'),('ZAR','987.65','Verified'),('USD','1000.00','Pending verification')]:
        db.add(Contribution(contribution_reference='overview-'+currency+status,member_id=approval.member_id,currency=currency,amount=Decimal(amount),status=status))
    db.commit()
    data=client.get(URL,headers=headers(db,member)).json()
    assert data['membership']['status']=='Activated' and data['membership']['activated_at']
    assert data['membership']['subscription_start_month']==approval.subscription_start_month
    assert data['registration_fee_verified'] is True
    assert data['fees']==client.get('/api/v1/membership/fees',headers=headers(db,member,token='second-overview-session')).json()
    fee=data['fees']['registration_fees'];assert len(fee)==1 and fee[0]['amount']=='20.00' and fee[0]['status']=='Paid'
    subscription=data['fees']['subscriptions'];assert len(subscription)==1 and subscription[0]['amount']=='5.00' and subscription[0]['due_date'] is None
    assert data['savings_interests'][0]['notice_version']=='historical-v1'
    assert data['savings_interests'][0]['notice_text']=='Historical notice, no approved plan terms.'
    assert data['plan_enrolment']['available'] is False
    assert data['savings']['available'] is True and data['savings']['confirmed']==[]
    assert all(number not in str(data) for number in ['123.45','987.65','1000.00'])

def test_no_unapproved_overdue_interpretation_on_either_screen(client,db,accounts):
    from datetime import date
    subscription=db.query(Subscription).filter_by(member_id=accounts['member'].member.id).one()
    subscription.status='Overdue';subscription.due_date=date(2020,1,1);db.commit()
    auth=headers(db,accounts['member'])
    overview=client.get(URL,headers=auth).json();fees=client.get('/api/v1/membership/fees',headers=auth).json()
    assert overview['fees']==fees
    assert fees['subscriptions'][0]['status']=='Requires office review'
    assert fees['subscriptions'][0]['due_date'] is None
    db.refresh(subscription)
    assert subscription.status=='Overdue' and subscription.due_date==date(2020,1,1) # Stored history preserved.
