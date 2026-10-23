import json,calendar
from datetime import datetime,timedelta,timezone,date
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo
import pytest
from app.models.evidence_enrolment import PlanEnrolment
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.withdrawal import WithdrawalRequest,WithdrawalEvent,WithdrawalPayout,WithdrawalDebit
from app.models.savings import SavingsLedgerEntry
from app.services import withdrawals,savings
from app.services.business_settings import active
from app.services.financial_reports import records
from app.services.enrolment import end_date
from app.security.auth import now
from tests.test_auth import accounts,headers
from tests.test_savings_workflow import setup,record,confirm,decision,URL as SAVINGS

URL='/api/v1/withdrawals'
POLICY={'withdrawal_mode':'full_or_partial','withdrawal_limits':'no_limits','withdrawal_methods':'cash_only',
    'withdrawal_approval_levels':1,'withdrawal_separation':'same_actor_allowed','withdrawal_cancellation':'before_processing_only',
    'withdrawal_failure':'evidence_review_before_release'}


def policy(db,actor,**changes):
    version,terms=active(db)
    row=BusinessSettingsVersion(base_version=version,request_key=str(uuid4()),snapshot=json.dumps({**terms,**POLICY,**changes}),actor_id=actor.id,actor_email=actor.email)
    db.add(row);db.flush();db.add(BusinessSettingsPublication(version_id=row.id,request_key=str(uuid4()),request_snapshot='TEST ONLY withdrawal policy; no normal approval',effective_at=now(),actor_id=actor.id,actor_email=actor.email));db.commit()


@pytest.fixture
def funded(client,db,setup,accounts):
    s=setup
    enrol=db.get(PlanEnrolment,s['enrolment_id'])
    today=now().date();index=today.year*12+today.month-1-8
    enrol.start_date=date(index//12,index%12+1,min(today.day,calendar.monthrange(index//12,index%12+1)[1]))
    enrol.end_date=end_date(enrol.start_date);db.commit()
    policy(db,accounts['administrator'])
    _,response=record(client,s,payment_date=str(enrol.end_date-timedelta(days=1)))
    assert response.status_code==201,response.text
    _,row=confirm(client,s,response.json())
    return {**s,'contribution':row}


def body(s,**changes):return {'request_key':str(uuid4()),'enrolment_id':s['enrolment_id'],'amount':'10.00','currency':'USD','acknowledged':True,**changes}


def act(client,s,row,kind,**changes):
    data={'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'reason':'TEST ONLY reviewed evidence','evidence_reference':'TEST-EVIDENCE',**changes}
    return client.post(f"{URL}/{row['id']}/{kind}",headers=s['admin'],json=data),data


def test_request_reservation_approval_notice_payout_retry_and_report(client,db,accounts,funded,monkeypatch):
    s=funded;original=body(s)
    response=client.post(URL,headers=s['own'],json=original);assert response.status_code==201,response.text
    row=response.json();assert row['status']=='Requested' and row['reserved']
    assert client.post(URL,headers=s['own'],json=original).json()['id']==row['id']
    assert client.post(URL,headers=s['own'],json=body(s,amount='0.01')).status_code==409
    assert withdrawals.funds(db,s['enrolment_id'])=={'confirmed':'10.00','reserved':'10.00','available':'0.00'}
    response,_=act(client,s,row,'approve');assert response.status_code==200,response.text
    row=response.json();assert row['status']=='Approved' and db.query(WithdrawalDebit).count()==0
    assert act(client,s,row,'process')[0].status_code==409
    end=datetime.fromisoformat(row['notice_ends_at'])
    monkeypatch.setattr(withdrawals,'now',lambda:end-timedelta(microseconds=1))
    assert act(client,s,row,'process')[0].status_code==409
    monkeypatch.setattr(withdrawals,'now',lambda:end)
    response,_=act(client,s,row,'process');assert response.status_code==200,response.text
    row=response.json();response,_=act(client,s,row,'record',method='manual_cash',payment_date=str(end.astimezone(ZoneInfo('Africa/Harare')).date()),payment_at=end.isoformat(),payment_reference='TEST-WITHDRAWAL-001');assert response.status_code==200,response.text
    row=response.json();assert not row['receipt_available'] and db.query(WithdrawalDebit).count()==0
    response,retry=act(client,s,row,'verify');assert response.status_code==200,response.text
    paid=response.json();assert paid['status']=='Paid' and paid['receipt_available']
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['admin'],json=retry).status_code==200
    assert act(client,s,paid,'cancel')[0].status_code==409
    assert db.query(WithdrawalDebit).count()==1 and db.query(SavingsLedgerEntry).count()==1
    assert withdrawals.funds(db,s['enrolment_id'])=={'confirmed':'0.00','reserved':'0.00','available':'0.00'}
    assert savings.summary(db,s['member_id'])['confirmed']==[{'currency':'USD','amount':'0.00'}]
    report=records(db,now().date(),end.date())
    assert report['net_ledger_movement']==[{'currency':'USD','amount':'0.00'}]
    assert any(r['category']=='withdrawal_debits' and r['amount']=='-10.00' for r in report['items'])
    assert client.get(f"{URL}/{row['id']}/receipt",headers=s['own']).status_code==200


@pytest.mark.parametrize('kind',['reject','cancel'])
def test_unprocessed_release_and_history(client,db,funded,kind):
    row=client.post(URL,headers=funded['own'],json=body(funded)).json()
    response,_=act(client,funded,row,kind);assert response.status_code==200
    assert withdrawals.funds(db,funded['enrolment_id'])['available']=='10.00'
    assert db.query(WithdrawalEvent).count()==2 and db.query(WithdrawalDebit).count()==0


def test_uncertain_outcome_stays_reserved_until_explicit_evidence_review(client,db,funded,monkeypatch):
    s=funded;row=client.post(URL,headers=s['own'],json=body(s)).json()
    row=act(client,s,row,'approve')[0].json()
    monkeypatch.setattr(withdrawals,'now',lambda:datetime.fromisoformat(row['notice_ends_at']))
    # Freeze timestamp before replacing row in the flow.
    timestamp=datetime.fromisoformat(row['notice_ends_at']);monkeypatch.setattr(withdrawals,'now',lambda:timestamp)
    row=act(client,s,row,'process')[0].json();row=act(client,s,row,'uncertain')[0].json()
    assert row['status']=='Uncertain' and withdrawals.funds(db,s['enrolment_id'])['available']=='0.00'
    assert act(client,s,row,'cancel')[0].status_code==409
    row=act(client,s,row,'not_paid')[0].json();assert row['status']=='Failed'
    assert withdrawals.funds(db,s['enrolment_id'])['available']=='10.00' and db.query(WithdrawalDebit).count()==0


def test_ownership_permissions_terms_and_frozen_policy(client,db,accounts,funded):
    s=funded
    assert client.post(URL,json=body(s)).status_code==401
    assert client.post(URL,headers=headers(db,accounts['other']),json=body(s)).status_code==404
    assert client.post(URL,headers=s['own'],json=body(s,actor_id=accounts['administrator'].id)).status_code==400
    assert client.post(URL,headers=s['own'],json=body(s,currency='ZWG')).status_code==400
    row=client.post(URL,headers=s['own'],json=body(s)).json()
    assert client.get(f"{URL}/{row['id']}",headers={'Authorization':'Bearer test-token-'+str(accounts['other'].id)}).status_code==404
    assert client.post(f"{URL}/{row['id']}/approve",headers=s['own'],json={'request_key':str(uuid4()),'base_event_id':0,'reason':'No','evidence_reference':'No'}).status_code==403
    frozen=db.get(WithdrawalRequest,row['id']).terms_snapshot
    policy(db,accounts['administrator'],withdrawal_mode=None)
    assert act(client,s,row,'approve')[0].status_code==200
    assert db.get(WithdrawalRequest,row['id']).terms_snapshot==frozen


def test_missing_policy_premature_and_reserved_credit_reversal_denied(client,db,accounts,setup):
    s=setup
    assert client.post(URL,headers=s['own'],json=body(s)).status_code==409
    policy(db,accounts['administrator'])
    eligibility=client.get(URL+'/eligibility',headers=s['own']).json()['items'][0]
    assert not eligibility['eligible_by_date'] and not eligibility['can_request']


def test_reserved_funds_prevent_reversing_the_funding_credit(client,db,funded):
    s=funded;client.post(URL,headers=s['own'],json=body(s))
    response=client.post(f"{SAVINGS}/{s['contribution']['id']}/reverse",headers=s['admin'],json=decision(s['contribution'],'Reversed'))
    assert response.status_code==409


@pytest.mark.parametrize('start,completion',[('2023-06-30','2024-02-29'),('2024-06-30','2025-02-28'),('2024-02-29','2024-10-29'),('2025-01-31','2025-09-30')])
def test_recorded_completion_midnight_boundary_not_current_settings(client,db,funded,monkeypatch,start,completion):
    from app.models.evidence_enrolment import PlanApplication
    enrol=db.get(PlanEnrolment,funded['enrolment_id']);enrol.start_date=date.fromisoformat(start);enrol.end_date=date.fromisoformat(completion);db.commit()
    midnight=datetime.fromisoformat(completion).replace(tzinfo=ZoneInfo('Africa/Harare'))
    plan=db.get(PlanApplication,enrol.application_id)
    monkeypatch.setattr(withdrawals,'now',lambda:midnight-timedelta(microseconds=1))
    assert not withdrawals.eligibility(db,plan,enrol)['eligible_by_date']
    monkeypatch.setattr(withdrawals,'now',lambda:midnight)
    state=withdrawals.eligibility(db,plan,enrol)
    assert state['eligible_by_date'] and state['earliest_possible_payout_at']==midnight+timedelta(days=14)


@pytest.mark.parametrize('ack',[False,1,'true'])
def test_request_acknowledgement_is_explicit_strict_boolean(client,db,funded,ack):
    assert client.post(URL,headers=funded['own'],json=body(funded,acknowledged=ack)).status_code==400


def test_separate_payout_verifier_and_authorised_staff_review(client,db,accounts,funded,monkeypatch):
    from tests.test_membership_workflow import grant
    s=funded
    policy(db,accounts['administrator'],withdrawal_separation='processor_verifier_separate')
    row=client.post(URL,headers=s['own'],json=body(s)).json()
    grant(db,accounts['staff'],'withdrawals:read','withdrawals:approve')
    data={'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'reason':'TEST authorised staff','evidence_reference':'TEST-STAFF'}
    response=client.post(f"{URL}/{row['id']}/approve",headers=s['verifier'],json=data)
    assert response.status_code==200,response.text
    row=response.json();timestamp=datetime.fromisoformat(row['notice_ends_at']);monkeypatch.setattr(withdrawals,'now',lambda:timestamp)
    row=act(client,s,row,'process')[0].json()
    row=act(client,s,row,'record',method='manual_cash',payment_date=str(timestamp.astimezone(ZoneInfo('Africa/Harare')).date()),payment_at=timestamp.isoformat(),payment_reference='TEST-SEPARATE-VERIFY')[0].json()
    assert act(client,s,row,'verify')[0].status_code==403
    grant(db,accounts['finance'],'withdrawals:verify')
    response=client.post(f"{URL}/{row['id']}/verify",headers=s['reconciler'],json={'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'reason':'TEST independent verification','evidence_reference':'TEST-INDEPENDENT'})
    assert response.status_code==200 and response.json()['status']=='Paid'


def test_pending_and_verified_but_unreconciled_funds_cannot_fund_request(client,db,accounts,setup):
    s=setup;enrol=db.get(PlanEnrolment,s['enrolment_id'])
    enrol.start_date=date(2025,1,31);enrol.end_date=end_date(enrol.start_date);db.commit();policy(db,accounts['administrator'])
    _,response=record(client,s,payment_date='2025-09-29');assert response.status_code==201
    row=response.json()
    for verified in [False,True]:
        if verified:
            assert client.post(f"{SAVINGS}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified')).status_code==200
        assert client.post(URL,headers=s['own'],json=body(s)).status_code==409
        assert withdrawals.funds(db,s['enrolment_id'])['confirmed']=='0.00'
    assert db.query(WithdrawalRequest).count()==0


def test_full_only_limits_two_reviewers_and_unpermissioned_staff(client,db,accounts,funded):
    from tests.test_membership_workflow import grant
    s=funded
    policy(db,accounts['administrator'],withdrawal_mode='full_only',withdrawal_approval_levels=2)
    assert client.post(URL,headers=s['own'],json=body(s,amount='5')).status_code==409
    row=client.post(URL,headers=s['own'],json=body(s)).json()
    assert client.post(f"{URL}/{row['id']}/approve",headers=s['verifier'],json={'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'reason':'Denied','evidence_reference':'Denied'}).status_code==403
    row=act(client,s,row,'approve')[0].json();assert row['status']=='Requested'
    assert act(client,s,row,'approve')[0].status_code==409
    grant(db,accounts['staff'],'withdrawals:approve')
    response=client.post(f"{URL}/{row['id']}/approve",headers=s['verifier'],json={'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'reason':'TEST second reviewer','evidence_reference':'TEST-SECOND'})
    assert response.status_code==200 and response.json()['status']=='Approved'
    assert db.query(WithdrawalDebit).count()==0
    assert withdrawals.policy_blockers({'withdrawal_limits':'bounded','withdrawal_usd_min':'20','withdrawal_usd_max':'10'},'USD')


@pytest.mark.parametrize('case',['before_notice','future','wrong_harare_date','exact_notice','exact_clock'])
def test_manual_payout_instant_boundaries_leave_failed_attempts_unposted(client,db,funded,monkeypatch,case):
    s=funded;row=client.post(URL,headers=s['own'],json=body(s)).json()
    row=act(client,s,row,'approve')[0].json()
    deadline=datetime.fromisoformat(row['notice_ends_at']);clock=deadline+timedelta(days=2)
    monkeypatch.setattr(withdrawals,'now',lambda:clock)
    row=act(client,s,row,'process')[0].json()
    at={'before_notice':deadline-timedelta(microseconds=1),'future':clock+timedelta(microseconds=1),
        'wrong_harare_date':deadline,'exact_notice':deadline,'exact_clock':clock}[case]
    payment_date=at.astimezone(ZoneInfo('Africa/Harare')).date()
    if case=='wrong_harare_date':payment_date+=timedelta(days=1)
    events=db.query(WithdrawalEvent).count()
    response,_=act(client,s,row,'record',method='manual_cash',payment_date=str(payment_date),payment_at=at.isoformat(),payment_reference='TEST-TIMESTAMP-BOUNDARY')
    valid=case in {'exact_notice','exact_clock'}
    assert response.status_code==(200 if valid else 400),response.text
    if not valid:assert 'Actual payout time' in response.json()['error']['message']
    assert db.query(WithdrawalPayout).count()==int(valid)
    assert db.query(WithdrawalEvent).count()==events+int(valid)
    assert db.query(WithdrawalDebit).count()==0
    assert withdrawals.funds(db,s['enrolment_id'])=={'confirmed':'10.00','reserved':'10.00','available':'0.00'}
