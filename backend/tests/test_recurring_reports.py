import json
from datetime import datetime,timezone,date
from decimal import Decimal
import pytest
from app.models.membership import MembershipApproval
from app.models.subscription import Subscription
from app.models.fee_currency import FeeObligation,SubscriptionFeePayment
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.audit_event import AuditEvent
from app.models.application import MembershipApplication
from app.services import recurring_subscriptions as recurring
from app.services.financial_reports import records,csv_export
from app.services.business_settings import DEFAULTS
from app.security.auth import now
from tests.test_auth import accounts,headers
from tests.test_membership_workflow import grant

URL='/api/v1/financial'


def activated(db,accounts,at=datetime(2025,12,31,23,30,tzinfo=timezone.utc),start='2026-02'):
    member=accounts['member'].member
    app=db.query(MembershipApplication).filter_by(member_id=member.id).one()
    row=MembershipApproval(application_id=app.id,member_id=member.id,user_id=accounts['member'].id,
        approved_by=accounts['administrator'].id,approver_email=accounts['administrator'].email,
        approved_at=at,activated_at=at,subscription_start_month=start,
        acknowledgement_version='synthetic',acknowledgement_text='TEST ONLY')
    db.add(row);db.commit();return row


def settings(db,actor,**patch):
    row=BusinessSettingsVersion(base_version=0,request_key=__import__('uuid').uuid4().hex,snapshot=json.dumps({**DEFAULTS,**patch}),actor_id=actor.id,actor_email=actor.email)
    db.add(row);db.flush();db.add(BusinessSettingsPublication(version_id=row.id,request_key=__import__('uuid').uuid4().hex,request_snapshot='TEST ONLY',effective_at=now(),actor_id=actor.id,actor_email=actor.email));db.commit();return row


def test_preview_catchup_retry_first_obligation_and_historical_freeze(client,db,accounts):
    approval=activated(db,accounts)
    auth=headers(db,accounts['administrator'])
    before=[tuple(s.__dict__.get(k) for k in ['id','amount','currency','period_month','due_date']) for s in db.query(Subscription).all()]
    p=client.get(URL+'/subscriptions/preview?through=2026-03',headers=auth)
    assert p.status_code==200,p.text
    assert [i['period_month'] for i in p.json()['items']]==['2026-02','2026-03']
    assert db.query(Subscription).count()==2
    run=client.post(URL+'/subscriptions/run',headers=auth,json={'through':'2026-03'})
    assert run.status_code==200,run.text
    assert run.json()['created']==2
    assert client.post(URL+'/subscriptions/run',headers=auth,json={'through':'2026-03'}).json()['created']==0
    old=db.query(Subscription).filter_by(member_id=approval.member_id,period_month='2026-02').one()
    frozen=db.query(FeeObligation).filter_by(subscription_id=old.id).one()
    assert frozen.amount==Decimal('5') and old.due_date is None
    settings(db,accounts['administrator'],subscription_amount='7.00',subscription_due_day=12)
    assert client.post(URL+'/subscriptions/run',headers=auth,json={'through':'2026-04'}).json()['created']==1
    new=db.query(Subscription).filter_by(member_id=approval.member_id,period_month='2026-04').one()
    assert new.amount==Decimal('7') and new.due_date==date(2026,4,12)
    db.refresh(old);db.refresh(frozen)
    assert old.amount==frozen.amount==Decimal('5') and old.due_date is None
    for snapshot in before:
        row=db.get(Subscription,snapshot[0]);assert tuple(getattr(row,k) for k in ['id','amount','currency','period_month','due_date'])==snapshot


@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_generation_denied_even_with_misplaced_grant(client,db,accounts,role):
    grant(db,accounts[role],'subscriptions:generate')
    h=headers(db,accounts[role])
    assert client.get(URL+'/subscriptions/preview',headers=h).status_code==403
    assert client.post(URL+'/subscriptions/run',headers=h,json={}).status_code==403


def test_invalid_future_period_and_inconsistent_activation_review(client,db,accounts):
    activated(db,accounts,start='2026-01')
    result=recurring.plan(db,'2026-03')
    assert result['count']==0 and len(result['requires_review_member_ids'])==1
    h=headers(db,accounts['administrator'])
    for month in ['2099-01','2026-13','invalid']:
        assert client.get(URL+'/subscriptions/preview',headers=h,params={'through':month}).status_code==400


def test_separate_subscription_verifier_retry_and_reports(client,db,accounts):
    admin=accounts['administrator'];auth=headers(db,admin)
    verifier=accounts['finance'];grant(db,verifier,'subscription-fees:verify');other=headers(db,verifier)
    sub=db.query(Subscription).filter_by(member_id=accounts['member'].member.id).one()
    body={'amount':'5.00','currency':'USD','payment_date':str(now().date()),'reference':'=SYNTHETIC-CSV-FORMULA'}
    target=f'/api/v1/membership/subscriptions/{sub.id}'
    assert client.post(target+'/payment',headers=auth,json=body).status_code==200
    assert client.post(target+'/payment',headers=auth,json=body).status_code==200
    assert client.post(target+'/verify',headers=auth,json={}).status_code==403
    assert client.post(target+'/verify',headers=other,json={}).status_code==200
    assert client.post(target+'/verify',headers=other,json={}).status_code==200
    q={'start':str(now().date().replace(day=1)),'end':str(now().date())}
    response=client.get(URL+'/reports',headers=auth,params=q)
    assert response.status_code==200,response.text
    assert any(t['category']=='subscription_payments' and t['amount']=='5.00' and t['status']=='Verified' for t in response.json()['totals'])
    export=client.get(URL+'/reports',headers=auth,params={**q,'export':'true'})
    assert export.status_code==200 and "'=SYNTHETIC-CSV-FORMULA" in export.text
    assert db.query(AuditEvent).filter_by(action='financial_report_exported').count()==1
    assert client.get(URL+'/reports',headers=headers(db,accounts['member']),params=q).status_code==403
    assert db.query(SubscriptionFeePayment).count()==1


def test_report_permissions_dates_and_empty_results(client,db,accounts):
    assert client.get(URL+'/reports?start=2026-01-01&end=2026-01-31').status_code==401
    h=headers(db,accounts['administrator'])
    assert client.get(URL+'/reports?start=2026-02-01&end=2026-01-01',headers=h).status_code==400
    response=client.get(URL+'/reports?start=2026-01-01&end=2026-01-31',headers=h)
    assert response.status_code==200 and response.json()['total']==0
    # A misplaced grant never makes a member an organisation-wide reporter.
    grant(db,accounts['member'],'reports:read','reports:export')
    assert client.get(URL+'/reports?start=2026-01-01&end=2026-01-31',headers=headers(db,accounts['member'])).status_code==403
    grant(db,accounts['finance'],'reports:read')
    assert client.get(URL+'/reports?start=2026-01-01&end=2026-01-31&export=true',headers=headers(db,accounts['finance'])).status_code==403
    assert client.post(URL+'/subscriptions/run',headers=h,json={'actor_id':accounts['member'].id}).status_code==400


def test_catchup_captures_rate_effective_at_creation_not_historical_month(db,accounts,monkeypatch):
    from datetime import timedelta
    from uuid import uuid4
    from app.models.fee_currency import FeeRateVersion,FeeRatePublication
    activated(db,accounts)
    boundary=now()+timedelta(hours=1)
    for rate,at in [('34',now()-timedelta(days=1)),('35',boundary)]:
        v=FeeRateVersion(base_version=0,request_key=str(uuid4()),rate=Decimal(rate),source='TEST ONLY',actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email)
        db.add(v);db.flush();db.add(FeeRatePublication(version_id=v.id,request_key=str(uuid4()),request_snapshot='TEST ONLY',effective_at=at,actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email))
    db.commit()
    monkeypatch.setattr(recurring,'now',lambda:boundary-timedelta(seconds=1))
    assert recurring.generate(db,through='2026-02')['created']==1
    db.commit()
    first=db.query(FeeObligation).one();assert first.zig_amount==Decimal('170')
    first_version=first.rate_version_id
    monkeypatch.setattr(recurring,'now',lambda:boundary)
    assert recurring.generate(db,through='2026-03')['created']==1
    db.commit();latest=db.query(FeeObligation).order_by(FeeObligation.id.desc()).first()
    assert latest.zig_amount==Decimal('175') and latest.rate_version_id!=first_version
    db.refresh(first);assert first.zig_amount==Decimal('170') and first.rate_version_id==first_version


def test_subscription_separation_is_frozen_at_recording(client,db,accounts):
    auth=headers(db,accounts['administrator'])
    sub=db.query(Subscription).filter_by(member_id=accounts['member'].member.id).one()
    body={'amount':'5.00','currency':'USD','payment_date':str(now().date()),'reference':'SYNTHETIC-FROZEN-SOD'}
    target=f'/api/v1/membership/subscriptions/{sub.id}'
    assert client.post(target+'/payment',headers=auth,json=body).status_code==200
    settings(db,accounts['administrator'],subscription_separation='same_actor_allowed')
    assert client.post(target+'/verify',headers=auth,json={}).status_code==403
