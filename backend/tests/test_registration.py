"""Public privacy, persistence, authorization and policy gates on isolated fixtures."""
import pytest
from app.models.application import MembershipApplication, ApplicationEvent, RegistrationSubmission
from app.models.member import Member
from app.models.user import User
from app.models.registration_fee import RegistrationFee
from app.models.auth import UserPermission
from app.models.permission import Permission
from tests.test_auth import accounts, headers

BODY = {'first_name':'Synthetic', 'last_name':'Applicant', 'email':'new@example.test', 'reason':'Test only'}


def test_public_pending_and_duplicate_privacy(client, db, accounts):
    before = (db.query(User).count(),db.query(Member).count(),db.query(RegistrationFee).count())
    response = client.post('/api/v1/registration', json=BODY)
    assert response.status_code == 202
    duplicate = client.post('/api/v1/registration', json={**BODY,'email':' NEW@EXAMPLE.TEST ', 'first_name':'Changed'})
    known = client.post('/api/v1/registration', json={**BODY,'email':accounts['administrator'].email})
    assert response.json() == duplicate.json() == known.json()
    assert not any(key in response.json() for key in ['id','email','application_number','user_id','token'])
    record = db.query(MembershipApplication).filter_by(email=BODY['email']).one()
    assert record.status == 'Pending' and record.member_id is None
    assert record.reviewed_by is None and record.first_name == 'Synthetic'
    history = db.query(ApplicationEvent).filter_by(application_id=record.id).one()
    assert history.status == 'Pending' and history.actor_user_id is None
    assert (db.query(User).count(),db.query(Member).count(),db.query(RegistrationFee).count()) == before


@pytest.mark.parametrize('extra', [{'status':'Approved'}, {'member_id':1}, {'reviewer_id':1}, {'role_id':1}, {'password':'secret'}, {'first_name':'   '}])
def test_cannot_supply_privileges_or_blank_names(client, db, extra):
    assert client.post('/api/v1/registration', json={**BODY,**extra}).status_code == 400
    assert db.query(MembershipApplication).count() == 0


def test_existing_legacy_application_not_duplicated(client, db, accounts):
    existing = db.query(MembershipApplication).first()
    assert client.post('/api/v1/registration', json={**BODY,'email':existing.email.upper()}).status_code == 202
    assert db.query(MembershipApplication).count() == 2


def test_throttles_without_enumerating(client, db):
    for n in range(10):
        assert client.post('/api/v1/registration', json={**BODY,'email':f'{n}@example.test'}).status_code == 202
    assert client.post('/api/v1/registration', json=BODY).status_code == 429


@pytest.mark.parametrize('role', ['member','finance'])
def test_review_denied_even_with_member_ownership(client, db, accounts, role):
    auth = headers(db,accounts[role])
    for path in ['/api/v1/applications/page','/api/v1/applications/review/1']:
        assert client.get(path,headers=auth).status_code == 403


@pytest.mark.parametrize('role', ['staff','administrator'])
def test_authorised_review_search_pagination_history(client, db, accounts, role):
    auth = headers(db,accounts[role])
    client.post('/api/v1/registration',json=BODY)
    page = client.get('/api/v1/applications/page?q=SYNTHETIC%20APPLICANT&limit=1',headers=auth).json()
    assert page['total'] == 1 and len(page['items']) == 1
    record_id = page['items'][0]['id']
    detail = client.get(f'/api/v1/applications/review/{record_id}',headers=auth).json()
    assert detail['history'][0]['status'] == 'Pending'
    assert detail['member_id'] is None
    assert client.get('/api/v1/applications/page?limit=1&skip=1',headers=auth).json()['total'] == 3
    assert client.get('/api/v1/applications/page?q=%25_',headers=auth).json()['items'] == []
    assert client.get('/api/v1/applications/page?q=missing',headers=auth).json()['total'] == 0
    assert client.get('/api/v1/applications/review/99999',headers=auth).status_code == 404
    assert client.patch(f'/api/v1/applications/{record_id}/decision?status=Approved',headers=auth).status_code in (403,503)
    assert db.get(MembershipApplication,record_id).status == 'Pending'


def test_permission_override_is_enforced(client, db, accounts):
    auth = headers(db,accounts['administrator'])
    permission = db.query(Permission).filter_by(code='applications:read').one()
    db.add(UserPermission(user_id=accounts['administrator'].id,permission_id=permission.id,allowed=False))
    db.commit()
    assert client.get('/api/v1/applications/page',headers=auth).status_code == 403
    assert client.get('/api/v1/applications/review/1',headers=auth).status_code == 403

@pytest.mark.parametrize('category', ['asset','holiday','emergency','retrenchment','education'])
def test_separate_interest_with_notice_snapshot(client, db, accounts, category):
    from app.models.application import SavingsInterest
    from app.models.member_plan import MemberPlan
    from app.registration_options import OPTIONS
    response=client.post('/api/v1/registration',json={**BODY,'preferred_category':category,'interest_notice_version':OPTIONS['version']})
    assert response.status_code==202
    interest=db.query(SavingsInterest).one()
    assert interest.category==category
    assert interest.notice_version==OPTIONS['version']
    assert interest.notice_text==OPTIONS['notice']+'\n'+OPTIONS['rules']
    application=db.get(MembershipApplication,interest.application_id)
    assert application.status=='Pending' and application.member_id is None
    assert db.query(MemberPlan).count()==0
    duplicate=client.post('/api/v1/registration',json={**BODY,'preferred_category':'education','interest_notice_version':OPTIONS['version']})
    assert duplicate.json()==response.json()
    assert db.query(SavingsInterest).count()==1
    db.refresh(interest); assert interest.category==category
    detail=client.get(f'/api/v1/applications/review/{application.id}',headers=headers(db,accounts['administrator'])).json()
    assert detail['savings_interest']['notice_text']==interest.notice_text
    assert 'accepted_at' not in detail['savings_interest']


@pytest.mark.parametrize('extra', [
 {'preferred_category':'invented','interest_notice_version':'savings-interest-v1'},
 {'preferred_category':'asset'},
 {'preferred_category':'asset','interest_notice_version':'old'},
 {'interest_notice_version':'savings-interest-v1'},
 {'preferred_category':'asset','interest_notice_version':'savings-interest-v1','accepted_terms':True},
])
def test_interest_rejects_unknown_stale_or_fabricated_terms(client, db, extra):
    from app.models.application import SavingsInterest
    assert client.post('/api/v1/registration',json={**BODY,**extra}).status_code==400
    assert db.query(SavingsInterest).count()==0
    assert db.query(MembershipApplication).count()==0
