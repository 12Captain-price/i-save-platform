"""Database-backed authentication. Tokens are returned once and stored hashed."""
import secrets
import json
from datetime import timedelta

from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.config import get_settings
from app.exceptions import APIError
from app.models.auth import AuthSession, LoginThrottle
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.security.auth import digest, now
from app.security.hashing import hash_password, verify_password

# Missing accounts still perform bcrypt work; never disclose existence/state.
DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def audit(db, actor, action, target=None, *, table="users", details=None):
    db.add(AuditEvent(event_type="security", actor_user_id=actor.id, actor_email=actor.email,
                      action=action, target_table=table, target_id=str(target or actor.id),
                      details=json.dumps(details) if details is not None else None))


def throttle(db, key):
    timestamp = now()
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stale = LoginThrottle.window_start <= timestamp - timedelta(minutes=15)
    statement = insert(LoginThrottle).values(key=key, attempts=1, window_start=timestamp).on_conflict_do_update(
        index_elements=[LoginThrottle.key], set_={
            "attempts": case((stale, 1), else_=LoginThrottle.attempts + 1),
            "window_start": case((stale, timestamp), else_=LoginThrottle.window_start),
        }).returning(LoginThrottle.attempts)
    attempts = db.execute(statement).scalar_one()
    # Count all attempts, including successful ones, independently per IP/account.
    db.commit()
    if attempts > 10:
        raise APIError(429, "rate_limited", "Try again later")


def login(db, email, password, ip):
    email = email.strip().lower()
    throttle(db, digest("account:" + email))
    throttle(db, digest("ip:" + ip))
    # Lock the account so login cannot race administrative revocation.
    if db.bind.dialect.name == "sqlite":
        db.execute(update(User).where(func.lower(User.email) == email).values(id=User.id, updated_at=User.updated_at))
    user = db.execute(select(User).where(func.lower(User.email) == email).with_for_update()).scalars().all()
    candidate = user[0] if len(user) == 1 else None
    valid = verify_password(password, candidate.password_hash if candidate and candidate.password_hash else DUMMY_HASH)
    if not valid or not candidate or not candidate.is_active or not candidate.password_hash:
        db.rollback()
        raise APIError(401, "invalid_credentials", "Invalid email or password")
    token = secrets.token_urlsafe(32)
    expires = now() + timedelta(minutes=get_settings().access_token_expire_minutes)
    db.add(AuthSession(token_hash=digest(token), user_id=candidate.id, expires_at=expires))
    audit(db, candidate, "login")
    db.commit()
    return token, expires


def revoke_all(db, user_id):
    db.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).values(revoked_at=now()))


def revoke_setup_links(db,user_id):
    from app.models.account_workflows import AccountLink
    from app.models.membership import PasswordSetupInvitation
    for model in (AccountLink,PasswordSetupInvitation):
        db.execute(update(model).where(model.user_id==user_id,model.consumed_at.is_(None),model.revoked_at.is_(None)).values(revoked_at=now()))
