import json
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.savings import SavingsContribution, SavingsEvent, SavingsLedgerEntry
from app.models.evidence_enrolment import PlanApplication, PlanEnrolment
from app.models.audit_event import AuditEvent
from app.models.business_settings import BusinessSettingsVersion, BusinessSettingsPublication
from app.services.business_settings import DEFAULTS
from app.services import savings
from app.security.auth import now
from tests.test_auth import accounts, headers
from tests.test_plan_enrolment import published, activated_member, apply_body

URL='/api/v1/savings'


@pytest.fixture
def setup(client,db,accounts):
    admin=headers(db,accounts['administrator']);version=published(client,db,admin);member=activated_member(db,accounts)
    own=headers(db,accounts['member'])
    p=client.post('/api/v1/member/plan-applications',headers=own,json=apply_body(version)).json()
    row=db.get(PlanApplication,p['id']);row.status='Active'
    today=now().date()
    db.add(PlanEnrolment(application_id=row.id,activated_at=now(),start_date=today-timedelta(days=2),end_date=today+timedelta(days=200),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email))
    for role,actions in [('staff',['read','verify']),('finance',['read','reconcile'])]:
        for action in actions:db.add(UserPermission(user_id=accounts[role].id,permission_id=db.query(Permission).filter_by(code='savings:'+action).one().id,allowed=True))
    version=BusinessSettingsVersion(base_version=0,request_key=str(uuid4()),snapshot=json.dumps({**DEFAULTS,'savings_week_start':'enrolment_start'}))
    db.add(version);db.flush();db.add(BusinessSettingsPublication(version_id=version.id,request_key=str(uuid4()),request_snapshot='Synthetic week allocation only',effective_at=now(),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email))
    db.commit()
    return {'admin':admin,'own':own,'verifier':headers(db,accounts['staff']),'reconciler':headers(db,accounts['finance']),'enrolment_id':row.id,'member_id':member.id}


def record(client,s,**patch):
    body={'request_key':str(uuid4()),'enrolment_id':s['enrolment_id'],'amount':'10.00','currency':'USD','payment_date':str(now().date()),'method':'Office cash','reference':'SYNTHETIC-'+uuid4().hex,**patch}
    return body,client.post(URL,headers=s['admin'],json=body)


def decision(row,outcome,**patch):
    return {'request_key':str(uuid4()),'base_event_id':row['base_event_id'],'outcome':outcome,'evidence_reference':'SYNTHETIC-EVIDENCE','reason':'Synthetic reviewed office evidence',**patch}


def confirm(client,s,row):
    r=client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified'));assert r.status_code==200,r.text
    row=r.json();body=decision(row,'Matched',observed_amount=row['amount'],observed_currency=row['currency'],observed_reference=row['reference'])
    r=client.post(f"{URL}/{row['id']}/reconcile",headers=s['reconciler'],json=body);assert r.status_code==200,r.text
    return body,r.json()


def test_pending_verified_reconciled_ledger_receipt_and_exact_retries(client,db,setup):
    s=setup;body,r=record(client,s);assert r.status_code==201,r.text
    row=r.json();assert row['status']=='Pending verification' and not row['receipt_available']
    assert client.post(URL,headers=s['admin'],json=body).json()['id']==row['id']
    assert client.get(f"{URL}/{row['id']}/receipt",headers=s['own']).status_code==409
    assert savings.summary(db,s['member_id'])['confirmed']==[]
    v=decision(row,'Verified');r=client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=v);assert r.status_code==200
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=v).status_code==200
    assert savings.summary(db,s['member_id'])['confirmed']==[]
    verified=r.json();reconcile=decision(verified,'Matched',observed_amount='10.00',observed_currency='USD',observed_reference=body['reference'])
    for _ in range(2):assert client.post(f"{URL}/{row['id']}/reconcile",headers=s['reconciler'],json=reconcile).status_code==200
    assert db.query(SavingsLedgerEntry).count()==1 and db.query(SavingsEvent).count()==2
    assert savings.summary(db,s['member_id'])['confirmed']==[{'currency':'USD','amount':'10.00'}]
    receipt=client.get(f"{URL}/{row['id']}/receipt",headers=s['own']).json();assert receipt['contribution']['reference']==body['reference']
    overview=client.get('/api/v1/membership/overview',headers=s['own']).json();assert overview['savings']['confirmed']==[{'currency':'USD','amount':'10.00'}]


def test_receipt_requires_ledger_evidence_not_just_a_projection_label(client,db,setup):
    _,r=record(client,setup);row=r.json()
    db.get(SavingsContribution,row['id']).status='Confirmed';db.commit()  # Isolated projection-corruption fixture, not a supported action.
    assert client.get(f"{URL}/{row['id']}",headers=setup['own']).json()['receipt_available'] is False
    assert client.get(f"{URL}/{row['id']}/receipt",headers=setup['own']).status_code==409
    assert savings.summary(db,setup['member_id'])['confirmed']==[]


@pytest.mark.parametrize('role',['member','other'])
def test_member_denials_and_cross_member_ownership(client,db,accounts,setup,role):
    s=setup;body,r=record(client,s);row=r.json();auth=s['own'] if role=='member' else headers(db,accounts[role])
    assert client.post(URL,headers=auth,json={**body,'request_key':str(uuid4())}).status_code==403
    for action in ['verify','reconcile','reverse','extra']:
        assert client.post(f"{URL}/{row['id']}/{action}",headers=auth,json=decision(row,'Verified')).status_code==403
    if role=='other':
        assert client.get(f"{URL}/{row['id']}",headers=auth).status_code==404
        assert client.get(f"{URL}/{row['id']}/receipt",headers=auth).status_code==404
        assert client.get(URL,headers=auth).json()['items']==[]
    assert client.get(URL).status_code==401


def test_default_separation_missing_permissions_and_spoofing(client,db,accounts,setup):
    s=setup;body,r=record(client,s);row=r.json()
    assert row['policy']['separation']=='distinct_all' and row['policy']['explicitly_configured'] is False
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['admin'],json=decision(row,'Verified')).status_code==403
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['admin'],json=decision(row,'Rejected')).status_code==403
    assert client.post(f"{URL}/{row['id']}/reconcile",headers=s['verifier'],json=decision(row,'Matched')).status_code==403
    assert client.post(URL,headers=s['admin'],json={**body,'recorded_by':accounts['member'].id}).status_code==400
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json={**decision(row,'Verified'),'actor_id':1}).status_code==400
    assert client.post('/api/v1/contributions',headers=s['admin'],json={'member_id':s['member_id'],'amount':'10','contribution_reference':'bypass'}).status_code==503
    assert client.post('/api/v1/verifications',headers=s['admin'],json={}).status_code==503


def test_unset_week_convention_requires_explicit_authorisation(client,db,setup,accounts):
    s=setup
    version=BusinessSettingsVersion(base_version=0,request_key=str(uuid4()),snapshot=json.dumps(DEFAULTS))
    db.add(version);db.flush();db.add(BusinessSettingsPublication(version_id=version.id,request_key=str(uuid4()),request_snapshot='Unset week convention',effective_at=now(),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email));db.commit()
    _,r=record(client,s,amount='1.00');row=r.json()
    assert row['policy']['weekly_allocation'] is None and any('convention is unset' in f for f in row['flags'])
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified')).status_code==409
    assert client.post(f"{URL}/{row['id']}/extra",headers=s['reconciler'],json=decision(row,'Authorised')).status_code==403
    row=client.post(f"{URL}/{row['id']}/extra",headers=s['admin'],json=decision(row,'Authorised')).json()
    _,row=confirm(client,s,row);assert row['status']=='Confirmed'


@pytest.mark.parametrize('patch',[{'amount':'0'},{'amount':'1.001'},{'amount':'NaN'},{'currency':'EUR'},{'currency':'ZWG'},{'reference':' '},{'enrolment_id':999999}])
def test_record_validation(client,setup,patch):
    _,r=record(client,setup,**patch);assert r.status_code in {400,409}


def test_normalised_reference_duplicate_and_conflicting_retry(client,setup):
    body,r=record(client,setup,reference='Receipt ABC');assert r.status_code==201
    _,r=record(client,setup,reference=' receipt   abc ');assert r.status_code==409
    assert client.post(URL,headers=setup['admin'],json={**body,'amount':'9.00'}).status_code==409


def test_fee_receipts_cannot_be_reused_as_savings_and_vice_versa(client,db,setup):
    from app.models.registration_fee import RegistrationFee
    from app.services.fee_currency import check_reference
    from app.exceptions import APIError
    db.add(RegistrationFee(member_id=setup['member_id'],fee_reference='FEE ONLY 123',amount='20.00',currency='USD',status='Paid'));db.commit()
    _,r=record(client,setup,reference=' fee   only 123 ');assert r.status_code==409
    _,r=record(client,setup,reference='SAVINGS ONLY 123');assert r.status_code==201
    with pytest.raises(APIError) as error:check_reference(db,' savings  only 123 ')
    assert error.value.status_code==409


def test_discrepancy_resolution_reversal_and_immutable_linked_history(client,db,setup):
    s=setup;_,r=record(client,s);row=r.json()
    row=client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified')).json()
    body=decision(row,'Matched',observed_amount='9',observed_currency='USD',observed_reference=row['reference'])
    assert client.post(f"{URL}/{row['id']}/reconcile",headers=s['reconciler'],json=body).status_code==400
    body['outcome']='Discrepancy';r=client.post(f"{URL}/{row['id']}/reconcile",headers=s['reconciler'],json=body);assert r.status_code==200
    row=r.json();assert row['status']=='Discrepancy' and db.query(SavingsLedgerEntry).count()==0
    body=decision(row,'Matched',observed_amount='10',observed_currency='USD',observed_reference=row['reference'])
    row=client.post(f"{URL}/{row['id']}/reconcile",headers=s['reconciler'],json=body).json()
    reversal=decision(row,'Reversed')
    for _ in range(2):r=client.post(f"{URL}/{row['id']}/reverse",headers=s['admin'],json=reversal);assert r.status_code==200
    assert client.post(f"{URL}/{row['id']}/reverse",headers=s['admin'],json=decision(r.json(),'Reversed')).status_code==409
    ledger=db.query(SavingsLedgerEntry).order_by(SavingsLedgerEntry.id).all();assert len(ledger)==2 and ledger[1].reverses_id==ledger[0].id
    assert sum(r.amount for r in ledger)==Decimal('0')
    assert savings.summary(db,s['member_id'])['confirmed']==[{'currency':'USD','amount':'0.00'}]


def test_rejection_and_outside_dates_and_explicit_extra(client,db,setup):
    s=setup;_,r=record(client,s,payment_date=str(now().date()-timedelta(days=5)));row=r.json();assert row['flags']
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified')).status_code==409
    r=client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Rejected'));assert r.json()['status']=='Rejected'
    _,r=record(client,s,amount='13.00');row=r.json();assert any('Extra' in f for f in row['flags'])
    assert client.post(f"{URL}/{row['id']}/verify",headers=s['verifier'],json=decision(row,'Verified')).status_code==409
    row=client.post(f"{URL}/{row['id']}/extra",headers=s['admin'],json=decision(row,'Authorised')).json()
    _,confirmed=confirm(client,s,row);assert confirmed['status']=='Confirmed'


def test_published_separation_applies_only_to_new_records(client,db,setup,accounts):
    s=setup;_,r=record(client,s,amount='1.00');old=r.json()
    version=BusinessSettingsVersion(base_version=0,request_key=str(uuid4()),snapshot=json.dumps({**DEFAULTS,'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'}))
    db.add(version);db.flush();db.add(BusinessSettingsPublication(version_id=version.id,request_key=str(uuid4()),request_snapshot='Synthetic policy',effective_at=now(),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email));db.commit()
    assert client.post(f"{URL}/{old['id']}/verify",headers=s['admin'],json=decision(old,'Verified')).status_code==403
    _,r=record(client,s,amount='1.00');row=r.json();assert row['policy']['separation']=='same_actor_allowed'
    s={**s,'verifier':s['admin'],'reconciler':s['admin']};_,row=confirm(client,s,row);assert row['status']=='Confirmed'


def test_currency_totals_legacy_and_fees_never_post_savings(client,db,setup,accounts):
    from app.models.plan_draft import PlanDraft,PlanDraftVersion
    from app.models.contribution import Contribution as Legacy
    from app.models.registration_fee import RegistrationFee
    from app.models.subscription import Subscription
    s=setup;original=db.get(PlanApplication,s['enrolment_id']);accepted=original.terms_snapshot
    draft=PlanDraft(latest_version=1);db.add(draft);db.flush()
    terms=json.loads(accepted);terms['terms']['currency']='ZWG'
    version=PlanDraftVersion(draft_id=draft.id,version=1,request_key=str(uuid4()),snapshot=json.dumps(terms['terms']),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email);db.add(version);db.flush()
    plan=PlanApplication(member_id=s['member_id'],draft_id=draft.id,version_id=version.id,terms_snapshot=json.dumps(terms),weekly_target='1000.00',currency='ZWG',acknowledgement_text=original.acknowledgement_text,acknowledged_at=now(),actor_id=accounts['member'].id,status='Active',request_key=str(uuid4()));db.add(plan);db.flush()
    db.add(PlanEnrolment(application_id=plan.id,activated_at=now(),start_date=now().date()-timedelta(days=1),end_date=now().date()+timedelta(days=200),actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email))
    for model in [Legacy,RegistrationFee,Subscription]:
        old=db.query(model).filter_by(member_id=s['member_id']).first();old.amount=Decimal('9999.00');old.status='Verified' if model==Legacy else 'Paid'
    db.commit()
    _,r=record(client,s);confirm(client,s,r.json())
    _,r=record(client,s,enrolment_id=plan.id,currency='ZWG',amount='340.00');confirm(client,s,r.json())
    totals={r['currency']:r['amount'] for r in savings.summary(db,s['member_id'])['confirmed']}
    assert totals=={'USD':'10.00','ZWG':'340.00'}
    assert db.get(PlanApplication,s['enrolment_id']).terms_snapshot==accepted
