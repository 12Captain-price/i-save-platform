from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from app.exceptions import APIError
from app.models.application import MembershipApplication
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.membership import ApplicationRegistrationPayment,MembershipApproval
from app.models.fee_currency import FeeObligation,FeeRateVersion,FeeRatePublication,SubscriptionFeePayment
from app.models.subscription import Subscription
from app.models.contribution import Contribution
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.services import fee_currency,membership
from app.security.auth import now
from tests.test_auth import accounts,headers
from tests.test_membership_workflow import pending,post,PAY,ACK,grant

RATES='/api/v1/admin/fee-rates'
SUB='/api/v1/membership/subscriptions'


def draft(client,auth,rate='34',base=0):
    body={'request_key':str(uuid4()),'base_version':base,'rate':rate,'source':'Synthetic management source'}
    response=client.post(RATES,headers=auth,json=body)
    assert response.status_code==201,response.text
    return response.json(),body


def publish(client,auth,version,effective=None):
    body={'request_key':str(uuid4()),'version_id':version,'effective_at':effective}
    response=client.post(RATES+'/publish',headers=auth,json=body)
    assert response.status_code==200,response.text
    return response.json(),body


def application(db,key):
    row=MembershipApplication(application_number=key,first_name='Synthetic',last_name=key,email=key+'@example.test',status='Pending')
    db.add(row);db.commit();return row


@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_rate_roles_and_subscription_escalation_denied(client,db,accounts,pending,role):
    for code in ['settings:read','settings:write','settings:publish','subscription-fees:record','subscription-fees:verify']:
        db.add(UserPermission(user_id=accounts[role].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();auth=headers(db,accounts[role])
    assert client.get(RATES,headers=auth).status_code==403
    assert client.post(RATES,headers=auth,json={'request_key':str(uuid4()),'base_version':0,'rate':'34','source':'Synthetic'}).status_code==403
    assert client.post(RATES+'/publish',headers=auth,json={'request_key':str(uuid4()),'version_id':1}).status_code==403
    if role in {'member','other'}:
        assert client.post(SUB+'/1/payment',headers=auth,json=PAY).status_code==403
        assert client.post(SUB+'/1/verify',headers=auth,json={}).status_code==403
        assert client.get(SUB,headers=auth).status_code==403


@pytest.mark.parametrize('code,method,path',[('settings:read','GET',RATES),('settings:write','POST',RATES),('settings:publish','POST',RATES+'/publish')])
def test_admin_each_rate_permission(client,db,accounts,code,method,path):
    db.add(UserPermission(user_id=accounts['administrator'].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=False));db.commit()
    body={'request_key':str(uuid4()),'base_version':0,'rate':'34','source':'Synthetic'} if path==RATES else {'request_key':str(uuid4()),'version_id':1}
    assert client.request(method,path,headers=headers(db,accounts['administrator']),**({'json':body} if method=='POST' else {})).status_code==403


@pytest.mark.parametrize('patch',[{'rate':'0'},{'rate':'-1'},{'rate':'NaN'},{'rate':'Infinity'},{'rate':'1.000000001'},{'source':''},{'source':'x'*501},{'actor_id':123}])
def test_invalid_rate_and_spoofing(client,db,accounts,patch):
    body={'request_key':str(uuid4()),'base_version':0,'rate':'34','source':'Synthetic',**patch}
    assert client.post(RATES,headers=headers(db,accounts['administrator']),json=body).status_code==400


@pytest.mark.parametrize('amount,rate,expected',[('20','34','680.00'),('5','34','170.00'),('1','1.005','1.01'),('1','1.00499999','1.00'),('0.01','0.5','0.01'),('10.01','34.125','341.59')])
def test_exact_decimal_half_up(amount,rate,expected):
    assert fee_currency.converted(amount,rate)==Decimal(expected)


@pytest.mark.parametrize('amount,rate',[('0.01','0.00000001'),('9999999999.99','9999999999.99999999')])
def test_unsupported_converted_range_rejected(amount,rate):
    with pytest.raises(APIError):fee_currency.converted(amount,rate)


def test_publication_effective_date_source_actor_retry_and_conflict(client,db,accounts):
    auth=headers(db,accounts['administrator'])
    row,body=draft(client,auth)
    assert fee_currency.active_rate(db) is None
    assert client.post(RATES,headers=auth,json=body).json()==row
    assert client.post(RATES,headers=auth,json={**body,'rate':'35'}).status_code==409
    assert client.post(RATES,headers=auth,json={**body,'request_key':str(uuid4())}).status_code==409
    future=now()+timedelta(days=2)
    result,pub=publish(client,auth,row['version'],future.isoformat())
    assert client.post(RATES+'/publish',headers=auth,json=pub).json()==result
    assert client.post(RATES+'/publish',headers=auth,json={**pub,'effective_at':None}).status_code==409
    assert fee_currency.active_rate(db) is None
    assert fee_currency.active_rate(db,at=future+timedelta(seconds=1)).rate==Decimal('34')
    publication=db.query(FeeRatePublication).one();assert publication.actor_id==accounts['administrator'].id
    state=client.get(RATES,headers=auth).json();assert state['active'] is None and state['publications'][0]['published_by']==accounts['administrator'].email
    assert db.query(AuditEvent).filter_by(action='fee_rate_published').count()==1
    row2,_=draft(client,auth,'35',row['version'])
    body2={'request_key':str(uuid4()),'version_id':row2['version']}
    assert client.post(RATES+'/publish',headers=auth,json=body2).status_code==409
    assert client.post(RATES+'/publish',headers=auth,json={**body2,'effective_at':(now()-timedelta(days=1)).isoformat()}).status_code==400
    assert client.post(RATES+'/publish',headers=auth,json={**body2,'effective_at':'2099-01-01T00:00:00'}).status_code==400
    assert client.post(RATES+'/publish',headers=auth,json={**body2,'actor_id':123}).status_code==400


def test_subscription_rate_effective_boundary_and_historical_preservation(client,db,accounts,monkeypatch):
    auth=headers(db,accounts['administrator'])
    first,_=draft(client,auth);publish(client,auth,first['version'])
    boundary=now()+timedelta(days=2)
    second,_=draft(client,auth,'35',first['version'])
    publish(client,auth,second['version'],boundary.isoformat())

    def activate_at(key,at):
        monkeypatch.setattr(membership,'now',lambda:at)
        app=application(db,key)
        for action,body in [('payment',{**PAY,'reference':key}),('verify',None),('approve',ACK),('activate',None)]:
            response=post(client,auth,app,action,body) if body is not None else post(client,auth,app,action)
            assert response.status_code==200,response.text
        approval=db.get(MembershipApproval,app.id)
        sub=db.query(Subscription).filter_by(member_id=approval.member_id).one()
        obligation=db.query(FeeObligation).filter_by(subscription_id=sub.id).one()
        return app,sub,obligation

    old_app,old,old_quote=activate_at('before-rate-boundary',boundary-timedelta(seconds=1))
    assert old_quote.rate_version_id==first['version'] and old_quote.zig_amount==Decimal('170')
    def snapshot(row):
        return {c.name:getattr(row,c.name) for c in row.__table__.columns}
    payment=db.get(ApplicationRegistrationPayment,old_app.id)
    preserved=[snapshot(row) for row in [old,old_quote,payment]]
    _,new,new_quote=activate_at('at-rate-boundary',boundary)
    assert new.amount==Decimal('5') and new.currency=='USD'
    assert new_quote.rate_version_id==second['version'] and new_quote.zig_amount==Decimal('175')
    for row,expected in zip([old,old_quote,payment],preserved):
        db.refresh(row);assert snapshot(row)==expected
    assert old.due_date is None and new.due_date is None


def test_no_rate_quote_stays_usd_only_after_publication(client,db,accounts,pending):
    auth=headers(db,accounts['administrator'])
    first=post(client,auth,pending,'obligation');assert first.status_code==200
    quote=first.json();assert quote['payment_options']==[{'amount':'20.00','currency':'USD'}] and quote['rate'] is None
    row,_=draft(client,auth);publish(client,auth,row['version'])
    assert post(client,auth,pending,'obligation').json()==quote
    assert post(client,auth,pending,'payment',{**PAY,'amount':'680','currency':'ZWG'}).status_code==409
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,'verify').status_code==200
    assert db.query(FeeObligation).count()==1


def test_registration_zig_frozen_rate_actual_payment_and_savings_untouched(client,db,accounts,pending):
    auth=headers(db,accounts['administrator'])
    row,_=draft(client,auth);publish(client,auth,row['version'])
    first=post(client,auth,pending,'obligation').json()
    assert first['payment_options'][1]=={'amount':'680.00','currency':'ZWG'}
    row2,_=draft(client,auth,'35',row['version']);publish(client,auth,row2['version'])
    assert post(client,auth,pending,'obligation').json()==first
    newer=application(db,'newer-fee-rate')
    assert post(client,auth,newer,'obligation').json()['payment_options'][1]['amount']=='700.00'
    body={**PAY,'amount':'680','currency':'ZWG'}
    assert post(client,auth,pending,'payment',{**body,'amount':'679.99'}).status_code==400
    assert post(client,auth,pending,'payment',{**body,'actor_id':123}).status_code==400
    assert post(client,auth,pending,'payment',body).status_code==200
    assert post(client,auth,pending,'payment',body).status_code==200
    assert post(client,auth,pending,'payment',{**body,'reference':'Another-receipt'}).status_code==409
    assert post(client,auth,pending,'approve',ACK).status_code==409
    assert post(client,auth,pending,'verify').status_code==200
    assert post(client,auth,pending,'verify').status_code==200
    assert post(client,auth,pending,'approve',ACK).status_code==200
    assert post(client,auth,pending,'activate').status_code==200
    payment=db.get(ApplicationRegistrationPayment,pending.id)
    assert payment.amount==Decimal('680') and payment.currency=='ZWG' and membership.verified(payment,db)
    approval=db.get(MembershipApproval,pending.id);sub=db.query(Subscription).filter_by(member_id=approval.member_id).one()
    sub_quote=db.query(FeeObligation).filter_by(subscription_id=sub.id).one()
    assert sub.amount==Decimal('5') and sub.currency=='USD' and sub_quote.zig_amount==Decimal('175') and sub_quote.rate_version_id==row2['version']
    own=headers(db,db.get(User,approval.user_id))
    fees=client.get('/api/v1/membership/fees',headers=own).json()
    assert fees['registration_fees'][0]['amount']=='20.00' and fees['registration_fees'][0]['currency']=='USD'
    assert fees['registration_fees'][0]['payment_amount']=='680.00' and fees['registration_fees'][0]['payment_currency']=='ZWG'
    assert 'published_by' not in fees['registration_fees'][0]['obligation']['rate']
    overview=client.get('/api/v1/membership/overview',headers=own).json()
    assert overview['registration_fee_verified'] is True and overview['fees']==fees and overview['savings']['available'] is True
    assert db.query(Contribution).filter_by(member_id=approval.member_id).count()==0


def test_subscription_exact_payment_separate_verification_reference_uniqueness_and_history(client,db,accounts,pending,monkeypatch):
    auth=headers(db,accounts['administrator'])
    row,_=draft(client,auth);publish(client,auth,row['version'])
    assert post(client,auth,pending,'payment',PAY).status_code==200
    assert post(client,auth,pending,'verify').status_code==200
    assert post(client,auth,pending,'approve',ACK).status_code==200
    assert post(client,auth,pending,'activate').status_code==200
    approval=db.get(MembershipApproval,pending.id);sub=db.query(Subscription).filter_by(member_id=approval.member_id).one()
    body={**PAY,'amount':'170','currency':'ZWG','reference':'Synthetic-subscription-receipt'}
    target=f'{SUB}/{sub.id}'
    # Activation creates next month's obligation; paying it before that month
    # is now explicitly unsupported. Advance only the fee service's test clock.
    from datetime import datetime,timezone
    monkeypatch.setattr(fee_currency,'now',lambda:datetime.fromisoformat(sub.period_month+'-01').replace(tzinfo=timezone.utc))
    assert client.post(target+'/payment',headers=auth,json={**body,'reference':PAY['reference']}).status_code==409
    assert client.post(target+'/payment',headers=auth,json={**body,'amount':'169.99'}).status_code==400
    assert client.post(target+'/payment',headers=auth,json=body).status_code==200
    assert client.post(target+'/payment',headers=auth,json=body).status_code==200
    assert sub.status=='Pending'
    assert client.post(target+'/payment',headers=auth,json={**body,'amount':'5','currency':'USD'}).status_code==409
    row2,_=draft(client,auth,'36',row['version']);publish(client,auth,row2['version'])
    assert client.post(target+'/verify',headers=auth,json={}).status_code==403
    grant(db,accounts['finance'],'subscription-fees:verify')
    verifier=headers(db,accounts['finance'])
    assert client.post(target+'/verify',headers=verifier,json={}).status_code==200
    assert client.post(target+'/verify',headers=verifier,json={}).status_code==200
    db.refresh(sub);payment=db.get(SubscriptionFeePayment,sub.id)
    assert sub.amount==Decimal('5') and sub.currency=='USD' and sub.status=='Paid'
    assert payment.amount==Decimal('170') and payment.currency=='ZWG' and payment.verified_by==accounts['finance'].id
    assert db.query(AuditEvent).filter_by(action='subscription_payment_verified').count()==1
    # That receipt cannot be reused on another application's registration.
    fresh=application(db,'cross-fee-reference')
    assert post(client,auth,fresh,'payment',{**PAY,'reference':body['reference']}).status_code==409


@pytest.mark.parametrize('missing',['subscription-fees:record','subscription-fees:verify'])
def test_subscription_record_and_verify_have_separate_permissions(client,db,accounts,missing):
    actor=accounts['staff'];other='subscription-fees:verify' if missing.endswith('record') else 'subscription-fees:record'
    grant(db,actor,other)
    action='payment' if missing.endswith('record') else 'verify'
    assert client.post(SUB+'/1/'+action,headers=headers(db,actor),json=PAY if action=='payment' else {}).status_code==403


def test_staff_with_both_permissions_can_record_and_verify_only_with_explicit_subscription_policy(client,db,accounts):
    from tests.test_recurring_reports import settings
    settings(db,accounts['administrator'],subscription_separation='same_actor_allowed')
    actor=accounts['staff'];grant(db,actor,'subscriptions:read','subscription-fees:record','subscription-fees:verify')
    auth=headers(db,actor);sub=db.query(Subscription).filter_by(member_id=accounts['member'].member.id).one()
    assert client.post(f'{SUB}/{sub.id}/payment',headers=auth,json={**PAY,'amount':'5','reference':'staff-full-payment'}).status_code==200
    assert client.post(f'{SUB}/{sub.id}/verify',headers=auth,json={}).status_code==200
    payment=db.get(SubscriptionFeePayment,sub.id);assert payment.recorded_by==payment.verified_by==actor.id


def test_savings_usd_and_zig_are_never_combined_or_relabelled(client,db,accounts):
    member=accounts['member'].member
    for currency,amount in [('USD','10'),('ZWG','340')]:
        db.add(Contribution(member_id=member.id,contribution_reference='currency-guard-'+currency,amount=amount,currency=currency,status='Verified'))
    db.commit()
    auth=headers(db,accounts['member'])
    response=client.get(f'/api/v1/contributions/{member.id}/confirmed-total',headers=auth)
    assert response.status_code==200 and response.json()['confirmed']==[] and response.json()['legacy_requires_review']>=2
    assert client.get('/api/v1/membership/overview',headers=auth).json()['savings']['available'] is True
    assert {(r.currency,str(r.amount)) for r in db.query(Contribution).filter_by(member_id=member.id,status='Verified')}=={('USD','10.00'),('ZWG','340.00')}
