"""Real permission and database queries; fixture transactions never touch office data."""
import pytest
from app.models.member import Member
from app.models.permission import Permission
from app.models.auth import UserPermission
from tests.test_auth import accounts, headers


@pytest.mark.parametrize("role", ["member", "staff", "finance"])
def test_overview_denied(client, db, accounts, role):
    auth = headers(db, accounts[role])
    assert client.get('/api/v1/admin/overview', headers=auth).status_code == 403
    if role == 'member':
        assert client.get('/api/v1/members/page', headers=auth).status_code == 403


def test_counts_empty_and_populated(client, db, accounts):
    auth = headers(db, accounts['administrator'])
    db.add(Member(member_number='unlinked', first_name='Ada', last_name='Test'))
    db.commit()
    assert client.get('/api/v1/admin/overview', headers=auth).json() == {
        'member_count':3, 'linked_member_count':2, 'unlinked_member_count':1, 'account_count':5}


def test_empty_database_counts(client, db):
    from app.bootstrap import bootstrap
    bootstrap(db, 'isolated@example.test', 'Synthetic-pass-123!')
    from app.models.user import User
    auth = headers(db, db.query(User).one())
    assert client.get('/api/v1/admin/overview', headers=auth).json() == {
        'member_count':0, 'linked_member_count':0, 'unlinked_member_count':0, 'account_count':1}
    assert client.get('/api/v1/members/page', headers=auth).json()['items'] == []


def test_search_and_stable_pagination(client, db, accounts):
    auth = headers(db, accounts['administrator'])
    db.add(Member(member_number='LITERAL%_01', first_name='Ada', last_name='Lovelace',
                  email='ada@example.test', phone='+27123456789'))
    db.commit()
    for term in ['ADA LOVELACE', 'ada@example', '271234', '%_', 'literal%_']:
        body = client.get('/api/v1/members/page', params={'q':term}, headers=auth).json()
        assert body['total'] == 1
        assert body['items'][0]['first_name'] == 'Ada'
    for term in ['missing', "' OR 1=1 --"]:
        assert client.get('/api/v1/members/page', params={'q':term}, headers=auth).json()['total'] == 0
    pages = [client.get('/api/v1/members/page', params={'skip':n, 'limit':1}, headers=auth).json() for n in range(4)]
    assert all(p['total'] == 3 for p in pages)
    ids = [p['items'][0]['id'] for p in pages[:3]]
    assert ids == sorted(set(ids))
    assert pages[3]['items'] == []
    assert isinstance(client.get('/api/v1/members', headers=auth).json(), list)


def test_individual_deny_overrides_admin_role(client, db, accounts):
    auth = headers(db, accounts['administrator'])
    permission = db.query(Permission).filter_by(code='members:read').one()
    db.add(UserPermission(user_id=accounts['administrator'].id, permission_id=permission.id, allowed=False))
    db.commit()
    for path in ['/api/v1/admin/overview', '/api/v1/members/page']:
        assert client.get(path, headers=auth).status_code == 403


@pytest.mark.parametrize('params', [{'skip':-1}, {'limit':101}, {'limit':0}, {'q':'x'*101}])
def test_invalid_page_parameters(client, db, accounts, params):
    assert client.get('/api/v1/members/page', params=params,
                      headers=headers(db, accounts['administrator'])).status_code == 400
