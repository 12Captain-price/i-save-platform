"""Authenticated assisted submissions use the public workflow without privacy bypasses."""
import pytest
from app.models.application import MembershipApplication,ApplicationSubmission,ApplicationEvent,SavingsInterest
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.member import Member
from app.models.registration_fee import RegistrationFee
from app.assisted_authorization import AUTHORIZATION
from app.registration_options import OPTIONS
from tests.test_auth import accounts,headers

BODY={'first_name':'Assisted','last_name':'Synthetic','email':'assisted@example.test','applicant_authorized':True,'authorization_version':AUTHORIZATION['version'],'preferred_category':'education','interest_notice_version':OPTIONS['version']}
PATH='/api/v1/registration/assisted'

def grant(db,user,code='applications:assist',allowed=True):
    permission=db.query(Permission).filter_by(code=code).one()
    db.add(UserPermission(user_id=user.id,permission_id=permission.id,allowed=allowed));db.commit()

@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_denied_without_specific_permission(client,db,accounts,role):
    assert client.post(PATH,json=BODY,headers=headers(db,accounts[role])).status_code==403
    assert db.query(ApplicationSubmission).count()==0

@pytest.mark.parametrize('role',['member','finance'])
def test_member_or_finance_cannot_use_assist_even_if_granted(client,db,accounts,role):
    grant(db,accounts[role])
    assert client.post(PATH,json=BODY,headers=headers(db,accounts[role])).status_code==403

@pytest.mark.parametrize('role',['staff','administrator'])
def test_permitted_pending_consent_actor_interest_and_review(client,db,accounts,role):
    actor=accounts[role]
    if role=='staff':grant(db,actor)
    auth=headers(db,actor)
    before=(db.query(User).count(),db.query(Member).count(),db.query(RegistrationFee).count())
    response=client.post(PATH,json=BODY,headers=auth)
    assert response.status_code==202
    submission=db.query(ApplicationSubmission).one()
    assert submission.source=='staff_assisted' and submission.actor_user_id==actor.id
    assert submission.actor_email==actor.email and submission.applicant_authorized is True
    assert submission.authorization_text==AUTHORIZATION['wording'] and submission.authorization_version==AUTHORIZATION['version']
    assert submission.authorized_at is not None
    application=db.get(MembershipApplication,submission.application_id)
    assert application.status=='Pending' and application.member_id is None and application.reviewed_by is None
    event=db.query(ApplicationEvent).filter_by(application_id=application.id).one()
    assert event.actor_user_id==actor.id and 'Staff-assisted' in event.note
    assert db.query(SavingsInterest).one().notice_version==OPTIONS['version']
    detail=client.get(f'/api/v1/applications/review/{application.id}',headers=auth).json()
    assert detail['submission']['actor_email']==actor.email
    assert detail['history'][0]['actor_email']==actor.email
    assert (db.query(User).count(),db.query(Member).count(),db.query(RegistrationFee).count())==before
    assert 'application_number' not in response.json()

@pytest.mark.parametrize('extra',[{'applicant_authorized':False},{'applicant_authorized':'true'},{'applicant_authorized':1},{'authorization_version':'old'},{'actor_user_id':999},{'actor_id':999},{'actor_email':'spoof@example.test'},{'source':'public'},{'status':'Approved'},{'authorization_text':'forged'},{'authorized_at':'2026-10-19T00:00:00Z'}])
def test_requires_real_consent_and_rejects_actor_spoofing(client,db,accounts,extra):
    assert client.post(PATH,json={**BODY,**extra},headers=headers(db,accounts['administrator'])).status_code==400
    assert db.query(ApplicationSubmission).count()==0

@pytest.mark.parametrize('field',['applicant_authorized','authorization_version'])
def test_missing_consent(client,db,accounts,field):
    body={**BODY};body.pop(field)
    assert client.post(PATH,json=body,headers=headers(db,accounts['administrator'])).status_code==400


def test_no_review_permission_still_generic_and_duplicates_preserve_original(client,db,accounts):
    actor=accounts['staff'];grant(db,actor);grant(db,actor,'applications:read',False)
    auth=headers(db,actor)
    response=client.post(PATH,json=BODY,headers=auth)
    submission=db.query(ApplicationSubmission).one();original=(submission.actor_user_id,submission.authorization_text,submission.authorized_at)
    assert client.get(f'/api/v1/applications/review/{submission.application_id}',headers=auth).status_code==403
    assert client.get('/api/v1/applications/page',headers=auth).status_code==403
    retry=client.post(PATH,json={**BODY,'first_name':'Overwrite','preferred_category':'asset'},headers=auth)
    other=client.post(PATH,json=BODY,headers=headers(db,accounts['administrator']))
    known=client.post(PATH,json={**BODY,'email':accounts['member'].email},headers=auth)
    assert response.json()==retry.json()==other.json()==known.json()
    assert db.query(ApplicationSubmission).count()==1
    db.refresh(submission);assert (submission.actor_user_id,submission.authorization_text,submission.authorized_at)==original
    assert db.query(SavingsInterest).one().category=='education'
    assert db.get(MembershipApplication,submission.application_id).first_name=='Assisted'
    assert db.query(ApplicationEvent).filter_by(application_id=submission.application_id).count()==1


def test_cross_channel_duplicate_preserves_public_source(client,db,accounts):
    public={k:v for k,v in BODY.items() if k not in ['applicant_authorized','authorization_version']}
    response=client.post('/api/v1/registration',json=public)
    assisted=client.post(PATH,json=BODY,headers=headers(db,accounts['administrator']))
    assert response.json()==assisted.json()
    source=db.query(ApplicationSubmission).one()
    assert source.source=='public' and source.actor_user_id is None and source.authorization_text is None


def test_individual_deny_and_revoked_session_block_submission(client,db,accounts):
    actor=accounts['administrator'];auth=headers(db,actor);grant(db,actor,allowed=False)
    assert client.post(PATH,json=BODY,headers=auth).status_code==403
    from app.services.auth import revoke_all
    revoke_all(db,actor.id);db.commit()
    assert client.post(PATH,json=BODY,headers=auth).status_code==401


def test_session_revoked_during_throttle_cannot_submit(client,db,accounts,monkeypatch):
    import app.routers.registration as route
    from app.services.auth import revoke_all
    actor=accounts['administrator'];auth=headers(db,actor);original=route.throttle
    def revoke_after_throttle(session,key):
        original(session,key);revoke_all(session,actor.id);session.commit()
    monkeypatch.setattr(route,'throttle',revoke_after_throttle)
    assert client.post(PATH,json=BODY,headers=auth).status_code==401
    assert db.query(ApplicationSubmission).count()==0
