"""Session authentication and explicit, deny-by-default access control."""
import hashlib
from datetime import datetime, timezone

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import APIError
from app.models.auth import AuthSession, UserPermission
from app.models.member import Member
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user import User

bearer = HTTPBearer(auto_error=False)
RESOURCES = ("members", "applications", "contributions", "fees", "subscriptions", "plans", "verifications", "audit", "users", "roles")
PERMISSIONS = {f"{r}:{action}" for r in RESOURCES for action in ("read", "write")}
PERMISSIONS.discard("audit:write")
PERMISSIONS |= {"savings:"+c for c in ["read","record","verify","reconcile","reverse","extra","own"]}
PERMISSIONS.add("applications:assist")
PERMISSIONS |= {'documents:view', 'documents:review', 'documents:replace', 'plans:approve', 'plans:publish', 'plan-applications:review', 'enrolments:activate', 'plans:own'}
PERMISSIONS |= {"subscription-fees:record", "subscription-fees:verify"}
PERMISSIONS |= {'subscriptions:generate','reports:read','reports:export'}
PERMISSIONS |= {'withdrawals:'+c for c in ['own','read','approve','process','verify']}
PERMISSIONS |= {"plans:drafts:read", "plans:drafts:write", "settings:read", "settings:write", "settings:publish"}
from app.membership_policy import CAPABILITIES
PERMISSIONS |= CAPABILITIES
PERMISSIONS |= {"members:own", "applications:own", "contributions:own", "fees:own", "subscriptions:own"}
SECURITY_PERMISSIONS = {"users:write", "roles:write"}
TEMPLATES = {
    "member": {p for p in PERMISSIONS if p.endswith(":own")},
    "staff": {"members:read", "applications:read", "plans:read"},
    "finance": {"members:read", "contributions:read", "fees:read", "subscriptions:read", "verifications:read", "plans:read"},
    "administrator": PERMISSIONS - {p for p in PERMISSIONS if p.endswith(":own")},
}


def now():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def unauthenticated():
    return APIError(401, "unauthenticated", "Authentication required", headers={"WWW-Authenticate": "Bearer"})


def validate_session(session):
    if not session or session.revoked_at or aware(session.expires_at) <= now():
        raise unauthenticated()


def current_session(request: Request, credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    from app.config import get_settings
    if get_settings().app_env.lower() == "production" and request.url.scheme != "https":
        raise APIError(400, "https_required", "HTTPS is required")
    if not credentials or len(credentials.credentials) > 128:
        raise unauthenticated()
    session = db.get(AuthSession, digest(credentials.credentials))
    validate_session(session)
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise unauthenticated()
    return session


def current_user(session: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    return db.get(User, session.user_id)


def permissions(db, user):
    codes = set(db.scalars(select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id)
                          .where(RolePermission.role_id == user.role_id)))
    overrides = db.execute(select(Permission.code, UserPermission.allowed)
                           .join(UserPermission, UserPermission.permission_id == Permission.id)
                           .where(UserPermission.user_id == user.id))
    for code, allowed in overrides:
        codes.add(code) if allowed else codes.discard(code)
    if not user.role or user.role.name not in {'administrator','staff','finance'}:
        codes -= {'savings:'+c for c in ['read','record','verify','reconcile','reverse','extra']}
    if not user.role or user.role.name!='member':
        codes.discard('savings:own')
    # Security administration is never delegable to non-administrator roles.
    if not user.role or user.role.name != "administrator":
        codes -= {'plans:approve', 'plans:publish'}
        codes -= SECURITY_PERMISSIONS
        codes -= {"plans:drafts:read", "plans:drafts:write", "settings:read", "settings:write", "settings:publish"}
    if not user.role or user.role.name not in {"staff", "administrator"}:
        codes -= {'documents:view', 'documents:review', 'documents:replace', 'plan-applications:review', 'enrolments:activate'}
        codes.discard("applications:assist")
        codes -= {'membership:approve','membership:activate','invitations:issue'}
    if not user.role or user.role.name not in {'staff','finance','administrator'}:
        codes -= {'registration-fees:record','registration-fees:verify','subscription-fees:record','subscription-fees:verify'}
    return codes & PERMISSIONS


def require(code):
    def dependency(user: User = Depends(current_user), db: Session = Depends(get_db)):
        if code not in permissions(db, user):
            raise APIError(403, "forbidden", "Permission required")
        return user
    return dependency


def resource_access(resource):
    def dependency(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
        codes = permissions(db, user)
        action = "read" if request.method == "GET" else "write"
        if f"{resource}:{action}" not in codes and not (action == "read" and f"{resource}:own" in codes):
            raise APIError(403, "forbidden", "Permission required")
        return user
    return dependency


def scoped_query(db, model, user, resource):
    query = db.query(model)
    if f"{resource}:read" not in permissions(db, user):
        owned = select(Member.id).where(Member.user_id == user.id)
        query = query.filter(model.id.in_(owned) if model is Member else model.member_id.in_(owned))
    return query


def check_owned(db, record, user, resource):
    if f"{resource}:read" in permissions(db, user):
        return
    member_id = record.id if isinstance(record, Member) else record.member_id
    if not db.query(Member).filter(Member.id == member_id, Member.user_id == user.id).first():
        raise APIError(404, "not_found", "Resource not found")


def unconfigured():
    raise APIError(503, "unconfigured", "This workflow requires approved business rules")
