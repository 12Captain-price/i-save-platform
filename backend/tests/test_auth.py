"""Exercise authorization through real HTTP routes, without bypassing auth."""
from datetime import timedelta

import pytest

from app.models.auth import AuthSession, UserPermission
from app.models.audit_event import AuditEvent
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.contribution import Contribution
from app.models.registration_fee import RegistrationFee
from app.models.subscription import Subscription
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.security.auth import PERMISSIONS, TEMPLATES, digest, now
from app.security.hashing import hash_password

PASSWORD = "Synthetic-pass-123!"


@pytest.fixture
def accounts(db):
    catalog = {}
    for code in sorted(PERMISSIONS):
        p = Permission(code=code)
        db.add(p)
        db.flush()
        catalog[code] = p
    users = {}
    for name, codes in TEMPLATES.items():
        role = Role(name=name)
        db.add(role)
        db.flush()
        for code in codes:
            db.add(RolePermission(role_id=role.id, permission_id=catalog[code].id))
        user = User(email=name+"@example.test", role_id=role.id, is_active=True)
        db.add(user)
        db.flush()
        users[name] = user
    other = User(email="other@example.test", role_id=users["member"].role_id)
    db.add(other)
    db.flush()
    users["other"] = other
    for key in ("member", "other"):
        member = Member(member_number=key, first_name=key, last_name="Synthetic", user_id=users[key].id)
        db.add(member)
        db.flush()
        db.add(Contribution(contribution_reference=key, member_id=member.id, amount=10))
        db.add(RegistrationFee(fee_reference=key, member_id=member.id, amount=20))
        db.add(Subscription(subscription_reference=key, member_id=member.id, period_month="2026-10", amount=5))
        db.add(MembershipApplication(application_number=key, member_id=member.id, first_name=key,
                                     last_name="Synthetic", email=users[key].email))
    db.commit()
    return users


def headers(db, user, token=None):
    token = token or ("test-token-"+str(user.id))
    db.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=now()+timedelta(minutes=30)))
    db.commit()
    return {"Authorization": "Bearer "+token}


def private_routes():
    import re
    from app.main import app
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            if not path.startswith("/api/v1/") or path == "/api/v1/auth/login":
                continue
            if path in {"/api/v1/registration", "/api/v1/auth/setup-password"}:
                continue
            if method == "get" and path.startswith("/api/v1/plans"):
                continue
            yield method, re.sub(r"\{[^}]+\}", "1", path)


@pytest.mark.parametrize("method,path", list(private_routes()))
def test_private_routes_require_authentication(client, method, path):
    response = client.request(method, path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("resource,model", [("members", Member), ("applications", MembershipApplication),
    ("contributions", Contribution), ("fees", RegistrationFee), ("subscriptions", Subscription)])
def test_member_can_only_read_own_rows(client, db, accounts, resource, model):
    auth = headers(db, accounts["member"])
    own_member = accounts["member"].member
    query = db.query(model)
    own = query.filter(model.id == own_member.id).first() if model is Member else query.filter(model.member_id == own_member.id).first()
    other = query.filter(model.id != own.id).first()
    response = client.get("/api/v1/"+resource, headers=auth)
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [own.id]
    assert client.get(f"/api/v1/{resource}/{own.id}", headers=auth).status_code == 200
    assert client.get(f"/api/v1/{resource}/{other.id}", headers=auth).status_code == 404
    foreign = client.get(f"/api/v1/{resource}/{other.id}", headers=auth).json()["error"]
    missing = client.get(f"/api/v1/{resource}/9999999", headers=auth).json()["error"]
    assert foreign["message"] == missing["message"]
    assert foreign["code"] == missing["code"]
    # Pagination is applied after ownership filtering.
    assert client.get(f"/api/v1/{resource}?skip=1&limit=1", headers=auth).json() == []


def test_totals_enforce_member_ownership(client, db, accounts):
    auth = headers(db, accounts["member"])
    assert client.get(f'/api/v1/contributions/{accounts["member"].member.id}/confirmed-total', headers=auth).status_code == 200
    assert client.get(f'/api/v1/contributions/{accounts["other"].member.id}/confirmed-total', headers=auth).status_code == 404


@pytest.mark.parametrize("role", ["member", "staff", "finance"])
def test_cannot_escalate_or_manage_accounts(client, db, accounts, role):
    auth = headers(db, accounts[role])
    admin = accounts["administrator"]
    for path, method, body in [
        (f"/users/{accounts[role].id}", "patch", {"role_id": admin.role_id}),
        ("/users", "post", {"email":"escalated@example.test", "password":PASSWORD,"role_id":admin.role_id}),
        (f"/roles/{accounts[role].role_id}", "patch", {"name":"administrator"}),
        (f"/roles/{accounts[role].role_id}/permissions/users:write", "post", {}),
        (f"/users/{accounts[role].id}/permissions/users:write", "put", {"allowed":True}),
        (f"/users/{admin.id}/sessions", "delete", None),
    ]:
        kwargs = {"headers":auth}
        if body is not None:
            kwargs["json"] = body
        assert client.request(method, "/api/v1"+path, **kwargs).status_code == 403
    assert accounts[role].role_id != admin.role_id


def test_login_logout_expiry_and_hash_only_storage(client, db, accounts):
    user = accounts["member"]
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    invalid = client.post("/api/v1/auth/login", json={"email":user.email,"password":"wrong"})
    unknown = client.post("/api/v1/auth/login", json={"email":"unknown@example.test","password":"wrong"})
    assert invalid.status_code == unknown.status_code == 401
    assert invalid.json() == unknown.json()
    response = client.post("/api/v1/auth/login", json={"email":user.email.upper(),"password":PASSWORD})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    token = response.json()["access_token"]
    session = db.get(AuthSession, digest(token))
    assert session and session.token_hash != token
    auth = {"Authorization":"Bearer "+token}
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401
    auth = headers(db, user, "expired-session")
    db.get(AuthSession, digest("expired-session")).expires_at = now()-timedelta(seconds=1)
    db.commit()
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401
    assert client.get("/api/v1/auth/me?access_token="+token).status_code == 401


def test_inactive_account_and_database_revocation(client, db, accounts):
    user = accounts["member"]
    auth = headers(db, user)
    user.is_active = False
    db.commit()
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    assert client.post("/api/v1/auth/login", json={"email":user.email,"password":PASSWORD}).status_code == 401


def test_permissions_are_reloaded_and_individual_denies_win(client, db, accounts):
    staff = accounts["staff"]
    auth = headers(db, staff)
    assert client.get("/api/v1/members", headers=auth).status_code == 200
    permission = db.query(Permission).filter_by(code="members:read").one()
    db.add(UserPermission(user_id=staff.id, permission_id=permission.id, allowed=False))
    db.commit()
    assert client.get("/api/v1/members", headers=auth).status_code == 403


def test_admin_changes_revoke_sessions_and_audit_actor(client, db, accounts):
    admin = accounts["administrator"]
    auth = headers(db, admin)
    staff_auth = headers(db, accounts["staff"])
    path = f'/api/v1/users/{accounts["staff"].id}/permissions/members:read'
    assert client.put(path, json={"allowed":False}, headers=auth).status_code == 204
    assert client.get("/api/v1/members", headers=staff_auth).status_code == 401
    event = db.query(AuditEvent).filter_by(action="permission_override_changed").one()
    assert event.actor_user_id == admin.id
    assert client.get("/api/v1/members", headers=headers(db, accounts["staff"], "new-staff-token")).status_code == 403
    assert client.delete(path, headers=auth).status_code == 204


def test_admin_cannot_lock_self_out_or_delegate_security(client, db, accounts):
    admin = accounts["administrator"]
    auth = headers(db, admin)
    assert client.patch(f"/api/v1/users/{admin.id}", json={"is_active":False}, headers=auth).status_code == 403
    assert client.patch(f"/api/v1/users/{admin.id}", json={"role_id":accounts["member"].role_id}, headers=auth).status_code == 403
    assert client.patch(f"/api/v1/roles/{admin.role_id}", json={"name":"not-admin"}, headers=auth).status_code == 409
    assert client.post(f'/api/v1/roles/{accounts["staff"].role_id}/permissions/users:write', headers=auth).status_code == 403
    assert client.put(f"/api/v1/users/{admin.id}/permissions/users:write", json={"allowed":False}, headers=auth).status_code == 403


def test_actor_is_derived_from_session_and_status_forgery_is_refused(client, db, accounts):
    admin = accounts["administrator"]
    auth = headers(db, admin)
    body = {"contribution_reference":"RECORDED", "member_id":accounts["member"].member.id, "amount":"7.50"}
    response = client.post(f'/api/v1/contributions?recorded_by={accounts["other"].id}', json=body, headers=auth)
    assert response.status_code == 201
    assert response.json()["recorded_by"] == admin.id
    body["contribution_reference"] = "FORGED"
    body["status"] = "Verified"
    assert client.post("/api/v1/contributions", json=body, headers=auth).status_code == 400
    body.pop("status")
    body["verified_by"] = admin.id
    assert client.post("/api/v1/contributions", json=body, headers=auth).status_code == 400


def test_unconfigured_approval_workflows_stay_disabled_even_for_admin(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    for method, path in [("post","/contributions/1/verify"),("post","/contributions/1/reverse"),
        ("post","/verifications"),("patch","/fees/1/paid"),("patch","/subscriptions/1/paid"),
        ("post","/subscriptions"),("patch","/applications/1/decision")]:
        assert client.request(method,"/api/v1"+path,headers=auth).status_code == 503


def test_passwords_and_validation_errors_never_expose_secrets(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    accounts["member"].password_hash = hash_password(PASSWORD)
    db.commit()
    response = client.get("/api/v1/users", headers=auth)
    assert response.status_code == 200
    assert "password" not in response.text
    response = client.post("/api/v1/auth/login", json={"email":"invalid", "password":PASSWORD})
    assert response.status_code == 400
    assert PASSWORD not in response.text
    response = client.post("/api/v1/users", headers=auth, json={"email":"invalid", "password":PASSWORD})
    assert PASSWORD not in response.text


def test_login_throttles_unknown_accounts(client):
    for _ in range(10):
        assert client.post("/api/v1/auth/login", json={"email":"missing@example.test","password":"wrong"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email":"missing@example.test","password":"wrong"}).status_code == 429


def test_password_change_revokes_every_session(client, db, accounts):
    user = accounts["member"]
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    auth = headers(db, user)
    other = headers(db, user, "second-session")
    assert client.post("/api/v1/auth/password", headers=auth, json={"current_password":"wrong","new_password":"New-synthetic-123"}).status_code == 401
    assert client.post("/api/v1/auth/password", headers=auth, json={"current_password":PASSWORD,"new_password":"New-synthetic-123"}).status_code == 204
    for token in (auth, other):
        assert client.get("/api/v1/auth/me", headers=token).status_code == 401


def test_public_plans_only_allow_public_reads(client):
    assert client.get("/api/v1/plans").status_code == 200
    assert client.post("/api/v1/plans", json={"name":"unauthorized"}).status_code == 401


def test_admin_can_provision_and_link_without_overwriting_existing_links(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    response = client.post("/api/v1/users", headers=auth, json={"email":"new-member@example.test",
                           "password":PASSWORD,"role_id":accounts["member"].role_id})
    assert response.status_code == 201
    user_id = response.json()["id"]
    assert "password" not in response.text
    member = Member(member_number="NEW", first_name="New", last_name="Synthetic")
    db.add(member)
    db.commit()
    assert client.put(f"/api/v1/members/{member.id}/account", headers=auth, json={"user_id":user_id}).status_code == 204
    assert client.put(f"/api/v1/members/{member.id}/account", headers=auth, json={"user_id":accounts["other"].id}).status_code == 409
    assert client.patch(f"/api/v1/members/{member.id}", headers=auth, json={"user_id":accounts["other"].id}).status_code == 400
    member_auth = headers(db, db.get(User,user_id), "new-member-session")
    assert client.get(f"/api/v1/members/{member.id}", headers=member_auth).status_code == 200
    assert client.put(f'/api/v1/members/{accounts["other"].member.id}/account', headers=member_auth, json={"user_id":user_id}).status_code == 403


def test_admin_deactivation_revokes_existing_sessions(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    member_auth = headers(db, accounts["member"])
    response = client.patch(f'/api/v1/users/{accounts["member"].id}', headers=auth, json={"is_active":False})
    assert response.status_code == 200
    assert client.get("/api/v1/auth/me", headers=member_auth).status_code == 401
    assert db.get(AuthSession, digest("test-token-"+str(accounts["member"].id))).revoked_at


def test_unlinked_members_see_no_other_members(client, db, accounts):
    user = User(email="unlinked@example.test",role_id=accounts["member"].role_id)
    db.add(user)
    db.commit()
    auth = headers(db,user)
    assert client.get("/api/v1/members",headers=auth).json() == []
    assert client.get("/api/v1/contributions",headers=auth).json() == []
    assert client.get(f'/api/v1/members/{accounts["member"].member.id}',headers=auth).status_code == 404


def test_production_auth_requires_https(client, monkeypatch):
    from app.config import Settings
    monkeypatch.setattr("app.config.get_settings", lambda: Settings(app_env="production"))
    assert client.post("/api/v1/auth/login",json={"email":"any@example.test","password":"wrong"}).status_code == 400
    assert client.get("/api/v1/auth/me",headers={"Authorization":"Bearer invalid"}).status_code == 400


def test_multibyte_password_limits_do_not_leak_input(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    password = "\u00e9"*40
    response = client.post("/api/v1/users",headers=auth,json={"email":"bytes@example.test","password":password})
    assert response.status_code == 400
    assert password not in response.text


@pytest.mark.parametrize("role", ["member", "staff", "finance"])
def test_default_roles_cannot_record_or_approve_money(client, db, accounts, role):
    auth = headers(db, accounts[role])
    assert client.post("/api/v1/contributions", headers=auth, json={"contribution_reference":"DENIED",
                       "member_id":accounts["member"].member.id,"amount":"10.00"}).status_code == 403
    assert client.post("/api/v1/contributions/1/verify",headers=auth).status_code == 403
    assert client.patch("/api/v1/applications/1/decision",headers=auth).status_code == 403


def test_role_grants_and_individual_allows_are_effective_and_audited(client, db, accounts):
    auth = headers(db, accounts["administrator"])
    member_auth = headers(db, accounts["member"])
    path = f'/api/v1/roles/{accounts["member"].role_id}/permissions/members:read'
    assert client.post(path,headers=auth).status_code == 204
    assert client.get("/api/v1/members",headers=member_auth).status_code == 401
    new_auth = headers(db, accounts["member"], "new-privileges")
    assert len(client.get("/api/v1/members",headers=new_auth).json()) == 2
    assert db.query(AuditEvent).filter_by(action="role_permission_granted",actor_user_id=accounts["administrator"].id).count() == 1
    path = f'/api/v1/users/{accounts["staff"].id}/permissions/contributions:write'
    assert client.put(path,headers=auth,json={"allowed":True}).status_code == 204
    staff_auth = headers(db,accounts["staff"],"allowed-recorder")
    response = client.post("/api/v1/contributions",headers=staff_auth,json={"contribution_reference":"ALLOWED",
                           "member_id":accounts["member"].member.id,"amount":"5.00"})
    assert response.status_code == 201
    assert response.json()["recorded_by"] == accounts["staff"].id


def test_password_changes_are_throttled(client, db, accounts):
    user = accounts["member"]
    auth = headers(db, user)
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    for _ in range(10):
        assert client.post("/api/v1/auth/password", headers=auth, json={
            "current_password":"incorrect", "new_password":"Replacement-123!"}).status_code == 401
    assert client.post("/api/v1/auth/password", headers=auth, json={
        "current_password":PASSWORD,"new_password":"Replacement-123!"}).status_code == 429


def test_password_change_rechecks_revocation_after_initial_auth(client, db, accounts, monkeypatch):
    import app.routers.auth as router
    original = router.throttle
    user = accounts["member"]
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    auth = headers(db,user)
    def revoke_during_request(session, key):
        original(session,key)
        from sqlalchemy import update
        session.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=now()),
                        execution_options={"synchronize_session":False})
        session.commit()
    monkeypatch.setattr(router,"throttle",revoke_during_request)
    assert client.post("/api/v1/auth/password",headers=auth,json={
        "current_password":PASSWORD,"new_password":"Replacement-123!"}).status_code == 401
    from app.security.hashing import verify_password
    db.refresh(user)
    assert verify_password(PASSWORD,user.password_hash)


def test_private_console_refuses_echo_fallback(monkeypatch):
    from getpass import GetPassWarning
    import warnings
    from app.security import console
    monkeypatch.setattr(console.sys.stdin,"isatty",lambda:True)
    def fallback(_):
        warnings.warn("Cannot disable echo",GetPassWarning)
        raise AssertionError("Must never read an echoed password")
    monkeypatch.setattr(console,"getpass",fallback)
    with pytest.raises(GetPassWarning):
        console.private_input("Password: ")


def test_private_live_verifier_does_not_return_credentials(client, db, accounts, monkeypatch):
    from app.verify_auth import verify
    # This fixture builds ORM tables inside a test transaction. Real migration
    # history/readiness is exercised separately by the lifecycle suite.
    monkeypatch.setattr("app.routers.health.require_current_schema", lambda *args, **kwargs: None)
    user = accounts["administrator"]
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    result = verify(client,user.email,PASSWORD)
    assert result["passed"], result
    import json
    serialized = json.dumps(result)
    assert PASSWORD not in serialized and user.email not in serialized
    assert "access_token" not in serialized and "Authorization" not in serialized
    assert all(row["passed"] for row in result["checks"])
    assert db.query(AuthSession).filter(AuthSession.revoked_at.is_(None)).count() == 0


@pytest.mark.parametrize("role,workspace", [("member","member"),("staff","staff"),("finance","finance"),("administrator","admin")])
def test_identity_reports_only_the_assigned_backend_workspace(client, db, accounts, role, workspace):
    response = client.get("/api/v1/auth/me",headers=headers(db,accounts[role]))
    assert response.status_code == 200
    assert response.json()["workspace"] == workspace
    assert "password" not in response.text


def test_unknown_roles_do_not_infer_a_workspace_from_permissions(client, db, accounts):
    role = Role(name="custom")
    db.add(role)
    db.flush()
    user = accounts["member"]
    user.role_id = role.id
    db.commit()
    response = client.get("/api/v1/auth/me",headers=headers(db,user))
    assert response.status_code == 200
    assert response.json()["workspace"] is None
