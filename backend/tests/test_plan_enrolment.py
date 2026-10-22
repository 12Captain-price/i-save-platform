import json
from datetime import date, timedelta, datetime, timezone
from uuid import uuid4
import pytest
from app.models.evidence_enrolment import PlanApplication, PlanEnrolment, PlanApplicationEvent, PlanApproval, PlanPublication
from app.models.plan_draft import PlanDraftVersion
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.membership import MembershipApproval
from app.models.member import Member
from app.models.contribution import Contribution
from app.models.subscription import Subscription
from app.models.registration_fee import RegistrationFee
from app.security.auth import now
from app.services import enrolment
from tests.test_auth import accounts, headers

URL='/api/v1/admin/plan-drafts'
COMPLETE={'category':'education','description':'Synthetic plan terms only','currency':'USD','contribution_mode':'member_chosen','minimum_amount':'1.25','maximum_amount':'99.00',
    'cadence':'weekly','duration_mode':'calendar_months','duration_months':8,'missed_contributions':'No automatic consequences for missed targets.',
    'extra_contributions':'Voluntary contributions require separate recording and verification.','missed_target_policy':'no_automatic_consequences',
    'extra_contribution_policy':'voluntary_no_automatic_posting','withdrawal_access':'after_completion_14_days_notice_review_unavailable','benefits_policy':'unavailable'}


def save(client,auth,terms=None):
    r=client.post(URL,headers=auth,json={'request_key':str(uuid4()),'base_version':0,'terms':COMPLETE if terms is None else terms})
    assert r.status_code==201,r.text
    return r.json()['draft_id']


def published(client,db,auth):
    identifier=save(client,auth)
    for action in ['approve','publish']:
        body={'request_key':str(uuid4()),'version':1,'acknowledged':True}
        r=client.post(f'{URL}/{identifier}/{action}',headers=auth,json=body);assert r.status_code==200,r.text
        assert client.post(f'{URL}/{identifier}/{action}',headers=auth,json=body).status_code==200
    return db.query(PlanDraftVersion).filter_by(draft_id=identifier).one()


def activated_member(db,accounts):
    member=db.query(Member).filter_by(user_id=accounts['member'].id).one()
    from app.models.application import MembershipApplication
    application=db.query(MembershipApplication).filter_by(member_id=member.id).one()
    db.add(MembershipApproval(application_id=application.id,member_id=member.id,user_id=accounts['member'].id,
        approved_by=accounts['administrator'].id,approver_email=accounts['administrator'].email,approved_at=now(),acknowledgement_version='synthetic',acknowledgement_text='Synthetic',activated_at=now()))
    db.commit();return member


def apply_body(row,**patch):
    return {'request_key':str(uuid4()),'version_id':row.id,'weekly_target':'12.50','acknowledged':True,'acknowledgement_version':'plan-application-v1',**patch}


@pytest.mark.parametrize('terms',[{}, {**COMPLETE,'currency':'ZAR'}, {**COMPLETE,'duration_months':7}, {**COMPLETE,'contribution_mode':'fixed','fixed_amount':'2.00'}, {**COMPLETE,'missed_target_policy':None}, {**COMPLETE,'benefits_policy':None}, {**COMPLETE,'withdrawal_access':None}])
def test_incomplete_or_unsupported_publication_blocked(client,db,accounts,terms):
    auth=headers(db,accounts['administrator']);identifier=save(client,auth,terms)
    r=client.post(f'{URL}/{identifier}/approve',headers=auth,json={'request_key':str(uuid4()),'version':1,'acknowledged':True})
    assert r.status_code==400
    assert client.get('/api/v1/public/plan-offers').json()=={'items':[]}
    assert db.query(PlanApproval).count()==db.query(PlanPublication).count()==0


@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_publication_admin_only_even_with_misplaced_grants(client,db,accounts,role):
    admin=headers(db,accounts['administrator']);identifier=save(client,admin)
    for code in ['plans:approve','plans:publish']:
        db.add(UserPermission(user_id=accounts[role].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();auth=headers(db,accounts[role])
    for action in ['approve','publish']:assert client.post(f'{URL}/{identifier}/{action}',headers=auth,json={'request_key':str(uuid4()),'version':1,'acknowledged':True}).status_code==403


def test_publication_effective_dates_draft_isolation_history_and_consent(client,db,accounts,monkeypatch):
    auth=headers(db,accounts['administrator']);identifier=save(client,auth)
    body={'request_key':str(uuid4()),'version':1,'acknowledged':True}
    assert client.post(f'{URL}/{identifier}/publish',headers=auth,json=body).status_code==409
    assert client.post(f'{URL}/{identifier}/approve',headers=auth,json={**body,'acknowledged':False}).status_code==400
    assert client.post(f'{URL}/{identifier}/approve',headers=auth,json={**body,'actor_id':123}).status_code==400
    assert client.post(f'{URL}/{identifier}/approve',headers=auth,json=body).status_code==200
    future=now()+timedelta(days=1)
    publish={**body,'request_key':str(uuid4()),'effective_at':future.isoformat()}
    assert client.post(f'{URL}/{identifier}/publish',headers=auth,json=publish).status_code==200
    assert client.get('/api/v1/public/plan-offers').json()['items']==[]
    monkeypatch.setattr(enrolment,'now',lambda:future+timedelta(seconds=1))
    offer=client.get('/api/v1/public/plan-offers').json()['items'][0]
    assert offer['terms']['duration_months']==8
    assert 'two weeks' in offer['withdrawal_access'] and 'unavailable' in offer['withdrawal_access']
    # A later incomplete draft never hides or changes the last effective published version.
    edit={'request_key':str(uuid4()),'base_version':1,'terms':{}}
    assert client.put(f'{URL}/{identifier}',headers=auth,json=edit).status_code==200
    assert client.get('/api/v1/public/plan-offers').json()['items'][0]==offer
    assert len(client.get(f'{URL}/{identifier}',headers=auth).json()['history'])==2


@pytest.mark.parametrize('start,end',[('2026-06-30','2027-02-28'),('2023-06-30','2024-02-29'),('2024-02-29','2024-10-29'),('2026-01-31','2026-09-30'),('2026-12-31','2027-08-31')])
def test_eight_calendar_month_end_dates(start,end):
    assert str(enrolment.end_date(date.fromisoformat(start)))==end


def test_owned_acceptance_review_activation_retries_no_financial_effect(client,db,accounts,monkeypatch):
    admin=headers(db,accounts['administrator']);row=published(client,db,admin);member=activated_member(db,accounts)
    own=headers(db,accounts['member']);other=headers(db,accounts['other'])
    url='/api/v1/member/plan-applications';body=apply_body(row)
    assert client.post(url,json=body).status_code==401
    for patch in [{'acknowledged':False},{'acknowledged':'true'},{'acknowledgement_version':'old'},{'actor_id':123},{'member_id':member.id},{'weekly_target':'0.50'},{'weekly_target':'1.001'}]:
        assert client.post(url,headers=own,json={**body,**patch}).status_code==400
    counts=[db.query(m).count() for m in [Contribution,RegistrationFee,Subscription]]
    r=client.post(url,headers=own,json=body);assert r.status_code==201,r.text
    result=r.json();identifier=result['id']
    assert client.post(url,headers=own,json=body).json()==result
    assert client.post(url,headers=own,json={**body,'request_key':str(uuid4())}).json()==result
    assert client.post(url,headers=own,json={**body,'weekly_target':'13.00'}).status_code==409
    assert client.get(url+f'/{identifier}',headers=other).status_code==404
    assert client.get(url+'?member_id='+str(member.id),headers=own).status_code==400
    assert client.get('/api/v1/review/plan-applications',headers=own).status_code==403
    review=f'/api/v1/review/plan-applications/{identifier}'
    assert client.post(review+'/activate',headers=admin,json={}).status_code==409
    decision={'base_status':'Pending','outcome':'Approved','reason':'Synthetic authorised plan review'}
    for _ in range(2):assert client.post(review+'/review',headers=admin,json=decision).status_code==200
    timestamp=datetime(2026,6,30,23,0,tzinfo=timezone.utc)
    monkeypatch.setattr(enrolment,'now',lambda:timestamp)
    for _ in range(2):assert client.post(review+'/activate',headers=admin,json={}).status_code==200
    enrol=db.get(PlanEnrolment,identifier)
    assert str(enrol.start_date)=='2026-07-01' and str(enrol.end_date)=='2027-03-01'
    assert db.query(PlanApplication).count()==db.query(PlanEnrolment).count()==1
    assert db.query(PlanApplicationEvent).count()==3
    assert counts==[db.query(m).count() for m in [Contribution,RegistrationFee,Subscription]]
    assert json.loads(db.get(PlanApplication,identifier).terms_snapshot)['terms']==result['terms']
    assert client.get(url,headers=other).json()=={'items':[]}
    assert client.get(url,headers=own).json()['items'][0]['enrolment']['end_date']=='2027-03-01'
    overview=client.get('/api/v1/membership/overview',headers=own).json()
    assert overview['plan_enrolment']['items'][0]['application_id']==identifier
    assert overview['savings']['available'] is False


@pytest.mark.parametrize('capability,action',[('plans:approve','approve'),('plans:publish','publish'),('plan-applications:review','review'),('enrolments:activate','activate')])
def test_separate_permissions(client,db,accounts,capability,action):
    admin=accounts['administrator'];auth=headers(db,admin);row=published(client,db,auth);activated_member(db,accounts)
    own=headers(db,accounts['member']);request=client.post('/api/v1/member/plan-applications',headers=own,json=apply_body(row)).json()
    db.add(UserPermission(user_id=admin.id,permission_id=db.query(Permission).filter_by(code=capability).one().id,allowed=False));db.commit()
    if action in {'approve','publish'}:url=f'{URL}/{row.draft_id}/{action}';body={'request_key':str(uuid4()),'version':1,'acknowledged':True}
    else:url=f"/api/v1/review/plan-applications/{request['id']}/{action}";body={} if action=='activate' else {'base_status':'Pending','outcome':'Approved','reason':'Synthetic'}
    assert client.post(url,headers=auth,json=body).status_code==403


def test_later_publication_preserves_exact_accepted_text_currency_and_target(client,db,accounts):
    admin=headers(db,accounts['administrator']);row=published(client,db,admin);activated_member(db,accounts)
    own=headers(db,accounts['member']);url='/api/v1/member/plan-applications'
    accepted=client.post(url,headers=own,json=apply_body(row)).json()
    stored=db.get(PlanApplication,accepted['id']).terms_snapshot
    revised={**COMPLETE,'description':'Later synthetic terms — not retrospective','currency':'ZWG','minimum_amount':'3.00'}
    response=client.put(f'{URL}/{row.draft_id}',headers=admin,json={'request_key':str(uuid4()),'base_version':1,'terms':revised})
    assert response.status_code==200
    for action in ['approve','publish']:
        assert client.post(f'{URL}/{row.draft_id}/{action}',headers=admin,json={'request_key':str(uuid4()),'version':2,'acknowledged':True}).status_code==200
    offer=client.get('/api/v1/public/plan-offers').json()['items'][0]
    assert offer['terms']['currency']=='ZWG' and offer['version_id']!=row.id
    historical=client.get(url+f"/{accepted['id']}",headers=own).json()
    assert historical==accepted and db.get(PlanApplication,accepted['id']).terms_snapshot==stored
    assert historical['currency']=='USD' and historical['weekly_target']=='12.50'
    assert client.post(url,headers=own,json=apply_body(row)).status_code==409


def test_specifically_authorised_staff_can_review_and_activate(client,db,accounts):
    admin=headers(db,accounts['administrator']);row=published(client,db,admin);activated_member(db,accounts)
    own=headers(db,accounts['member']);created=client.post('/api/v1/member/plan-applications',headers=own,json=apply_body(row)).json()
    staff=accounts['staff']
    for code in ['plan-applications:review','enrolments:activate']:
        db.add(UserPermission(user_id=staff.id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();auth=headers(db,staff);prefix=f"/api/v1/review/plan-applications/{created['id']}"
    assert client.get('/api/v1/review/plan-applications',headers=auth).status_code==200
    decision={'base_status':'Pending','outcome':'Approved','reason':'Synthetic authorised staff decision'}
    assert client.post(prefix+'/review',headers=auth,json={**decision,'actor_id':accounts['administrator'].id}).status_code==400
    assert client.post(prefix+'/review',headers=auth,json=decision).status_code==200
    response=client.post(prefix+'/activate',headers=auth,json={});assert response.status_code==200
    assert response.json()['enrolment']['activated_by']==staff.email
    assert db.get(PlanEnrolment,created['id']).actor_id==staff.id
