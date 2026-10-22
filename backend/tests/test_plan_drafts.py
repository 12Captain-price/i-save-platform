"""Unpublished snapshots must never become live plans or financial records."""
from uuid import uuid4
import pytest
from app.models.plan_draft import PlanDraftVersion
from app.models.audit_event import AuditEvent
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.savings_plan import SavingsPlan
from app.models.member_plan import MemberPlan
from app.models.contribution import Contribution
from app.models.application import SavingsInterest
from tests.test_auth import accounts, headers

URL = '/api/v1/admin/plan-drafts'


def payload(terms=None, base=0):
    return {'request_key': str(uuid4()), 'base_version': base, 'terms': terms or {}}


@pytest.mark.parametrize('role', ['member', 'other', 'staff', 'finance'])
def test_nonadmin_cannot_read_or_write_even_with_grants(client, db, accounts, role):
    user = accounts[role]
    for code in ['plans:drafts:read', 'plans:drafts:write']:
        db.add(UserPermission(user_id=user.id, permission_id=db.query(Permission).filter_by(code=code).one().id, allowed=True))
    db.commit()
    auth = headers(db, user)
    for method, path, body in [('GET', URL, None), ('GET', URL+'/1', None), ('POST', URL, payload()), ('PUT', URL+'/1', payload(base=1))]:
        assert client.request(method, path, headers=auth, json=body).status_code == 403


@pytest.mark.parametrize('code,method', [('plans:drafts:read', 'GET'), ('plans:drafts:write', 'POST')])
def test_admin_needs_specific_permission(client, db, accounts, code, method):
    user = accounts['administrator']
    db.add(UserPermission(user_id=user.id, permission_id=db.query(Permission).filter_by(code=code).one().id, allowed=False)); db.commit()
    assert client.request(method, URL, headers=headers(db, user), **({'json': payload()} if method == 'POST' else {})).status_code == 403


def test_incomplete_version_history_retry_actor_and_no_side_effects(client, db, accounts):
    auth = headers(db, accounts['administrator'])
    models = [SavingsPlan, MemberPlan, Contribution, SavingsInterest]
    before = [db.query(m).count() for m in models]
    body = payload()
    first = client.post(URL, headers=auth, json=body)
    assert first.status_code == 201, first.text
    row = first.json(); identifier = row['draft_id']
    assert row['version'] == 1 and len(row['missing_decisions']) == 8
    assert all(v is None for v in row['terms'].values())
    assert row['actor_email'] == accounts['administrator'].email
    assert client.post(URL, headers=auth, json=body).json() == row
    complete = {'category':'education', 'description':'Synthetic only', 'currency':'USD',
                'contribution_mode':'member_chosen', 'minimum_amount':'1.25', 'maximum_amount':'9.50',
                'cadence':'weekly', 'duration_mode':'open_ended',
                'missed_contributions':'Decision proposed, not approved.', 'extra_contributions':'Review proposal.'}
    edit = payload(complete, 1)
    second = client.put(f'{URL}/{identifier}', headers=auth, json=edit)
    assert second.status_code == 200, second.text
    assert second.json()['missing_decisions'] == []
    assert client.put(f'{URL}/{identifier}', headers=auth, json=edit).json() == second.json()
    assert client.put(f'{URL}/{identifier}', headers=auth, json=payload({}, 1)).status_code == 409
    assert client.post(URL, headers=auth, json={**edit, 'base_version':0}).status_code == 409
    history = client.get(f'{URL}/{identifier}', headers=auth).json()['history']
    assert [v['version'] for v in history] == [2, 1]
    assert history[1] == row
    assert db.query(PlanDraftVersion).count() == 2
    assert db.query(AuditEvent).filter(AuditEvent.event_type=='plan_draft').count() == 2
    assert before == [db.query(m).count() for m in models]
    assert client.get('/api/v1/plans').json() == []
    assert client.post(f'{URL}/{identifier}/publish', headers=auth, json={}).status_code == 400
    assert client.get(URL+'?skip=1&limit=1', headers=auth).json() == {'items':[], 'total':1}


@pytest.mark.parametrize('terms', [
    {'currency':'usd'}, {'category':'invented'}, {'fixed_amount':'0'}, {'fixed_amount':'1.001'},
    {'minimum_amount':'5', 'maximum_amount':'2'}, {'cadence':'monthly'},
    {'contribution_mode':'member_chosen','fixed_amount':'2'},
    {'fixed_amount':'2','minimum_amount':'3'}, {'fixed_amount':'4','maximum_amount':'3'},
    {'duration_mode':'open_ended','duration_weeks':3}, {'duration_weeks':0}, {'duration_weeks':1.5},
    {'is_published':True}, {'actor_id':123}, {'description':'x'*4001},
])
def test_invalid_proposals_are_rejected(client, db, accounts, terms):
    assert client.post(URL, headers=headers(db, accounts['administrator']), json=payload(terms)).status_code == 400
    assert db.query(PlanDraftVersion).count() == 0


def test_fixed_incomplete_and_actor_spoofing(client, db, accounts):
    auth = headers(db, accounts['administrator'])
    body = payload({'contribution_mode':'fixed','duration_mode':'fixed'})
    assert client.post(URL, headers=auth, json={**body,'actor_id':accounts['other'].id}).status_code == 400
    data = client.post(URL, headers=auth, json=body).json()
    assert 'fixed_amount' in data['missing_decisions'] and 'duration_weeks' in data['missing_decisions']
    edit = payload({'contribution_mode':'fixed','fixed_amount':'3.25','duration_mode':'fixed','duration_weeks':12},1)
    assert client.put(f"{URL}/{data['draft_id']}", headers=auth, json=edit).status_code == 200
