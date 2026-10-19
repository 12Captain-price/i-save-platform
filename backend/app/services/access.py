"""Serialized security administration and audited permission changes."""
from sqlalchemy import func, select, update

from app.exceptions import APIError, conflict, not_found
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.security.auth import PERMISSIONS, SECURITY_PERMISSIONS, TEMPLATES, permissions
from app.security.hashing import hash_password
from app.services.auth import audit, revoke_all
from app.services import user as users, role as roles


def guard(db, actor):
    # This role row serializes changes to the administrator set, including
    # simultaneous attempts by two admins to deactivate each other.
    if db.bind.dialect.name == "sqlite":
        db.execute(update(Role).where(Role.name == "administrator").values(id=Role.id, updated_at=Role.updated_at))
    role = db.execute(select(Role).where(Role.name == "administrator").with_for_update()).scalar_one_or_none()
    if not role:
        raise APIError(403, "forbidden", "Security administrator required")
    db.refresh(actor)
    if not actor.is_active or actor.role_id != role.id or not SECURITY_PERMISSIONS <= permissions(db, actor):
        raise APIError(403, "forbidden", "Security administrator required")
    return role


def create_user(db, actor, body):
    guard(db, actor)
    if body.role_id is not None and not db.get(Role, body.role_id):
        raise not_found("Role not found")
    normalized = body.model_copy(update={"email": body.email.strip().lower()})
    if db.query(User).filter(func.lower(User.email) == normalized.email).first():
        raise conflict("Email already registered")
    user = User(email=normalized.email, password_hash=hash_password(normalized.password), role_id=normalized.role_id, is_active=normalized.is_active)
    db.add(user)
    db.flush()
    audit(db, actor, "account_created", user.id)
    db.commit()
    db.refresh(user)
    return user


def update_user(db, actor, user_id, body):
    admin_role = guard(db, actor)
    target = db.execute(select(User).where(User.id == user_id).with_for_update()).scalar_one_or_none()
    if not target:
        raise not_found("User not found")
    data = body.model_dump(exclude_unset=True)
    if any(data[k] is None for k in ("email", "is_active") if k in data):
        raise APIError(400, "bad_request", "Email and active status cannot be null")
    if "role_id" in data and data["role_id"] is not None and not db.get(Role, data["role_id"]):
        raise not_found("Role not found")
    if target.id == actor.id and any(k in data and data[k] != getattr(target, k) for k in ("role_id", "is_active")):
        raise APIError(403, "forbidden", "Cannot change your own role or active status")
    losing_admin = target.role_id == admin_role.id and target.is_active and (
        data.get("role_id", target.role_id) != admin_role.id or data.get("is_active", True) is False)
    if losing_admin and db.query(User).filter(User.role_id == admin_role.id, User.is_active.is_(True), User.id != target.id).count() == 0:
        raise conflict("Cannot remove the last active administrator")
    if data.get("role_id") == admin_role.id and db.query(UserPermission).filter_by(user_id=user_id).first():
        raise conflict("Review and remove permission overrides before assigning administrator")
    if "email" in data:
        data["email"] = data["email"].strip().lower()
        if db.query(User).filter(func.lower(User.email) == data["email"], User.id != user_id).first():
            raise conflict("Email already registered")
    revoke_all(db, user_id)
    audit(db, actor, "account_updated_sessions_revoked", user_id, details={"fields": sorted(data)})
    return users.update_user(db, user_id, body.model_copy(update=data))


def override_permission(db, actor, user_id, code, allowed):
    admin_role = guard(db, actor)
    target = db.get(User, user_id)
    if not target:
        raise not_found("User not found")
    if target.id == actor.id or target.role_id == admin_role.id or code in SECURITY_PERMISSIONS:
        raise APIError(403, "forbidden", "Administrator privileges cannot be changed through overrides")
    if code not in PERMISSIONS:
        raise APIError(400, "bad_request", "Unknown permission")
    permission = db.query(Permission).filter_by(code=code).first()
    if not permission:
        raise not_found("Permission catalog not initialized")
    row = db.get(UserPermission, (user_id, permission.id))
    if allowed is None:
        if row:
            db.delete(row)
    elif row:
        row.allowed = allowed
    else:
        db.add(UserPermission(user_id=user_id, permission_id=permission.id, allowed=allowed))
    revoke_all(db, user_id)
    audit(db, actor, "permission_override_removed" if allowed is None else "permission_override_changed", user_id,
          details={"permission": code, "allowed": allowed})
    db.commit()


def create_role(db, actor, body):
    guard(db, actor)
    if body.name.strip().lower() in TEMPLATES or body.name.strip().lower() == "admin":
        raise conflict("Reserved role name")
    if db.query(Role).filter_by(name=body.name).first():
        raise conflict("Role already exists")
    role = Role(name=body.name, description=body.description)
    db.add(role)
    db.flush()
    audit(db, actor, "role_created", role.id, table="roles")
    db.commit()
    db.refresh(role)
    return role


def update_role(db, actor, role_id, body):
    guard(db, actor)
    role = db.get(Role, role_id)
    if not role:
        raise not_found("Role not found")
    if body.name is not None and body.name != role.name:
        if role.name in TEMPLATES or body.name.strip().lower() in {*TEMPLATES, "admin"}:
            raise conflict("Reserved roles cannot be renamed or impersonated")
    if "name" in body.model_fields_set and body.name is None:
        raise APIError(400, "bad_request", "Role name cannot be null")
    audit(db, actor, "role_updated", role_id, table="roles")
    return roles.update_role(db, role_id, body)


def grant_permission(db, actor, role_id, code):
    guard(db, actor)
    role = db.get(Role, role_id)
    if not role:
        raise not_found("Role not found")
    if role.name == "administrator" or code in SECURITY_PERMISSIONS:
        raise APIError(403, "forbidden", "Security privileges cannot be delegated")
    if code not in PERMISSIONS:
        raise APIError(400, "bad_request", "Unknown permission")
    permission = db.query(Permission).filter_by(code=code).first()
    if not permission:
        raise not_found("Permission catalog not initialized")
    if not db.get(RolePermission, (role_id, permission.id)):
        db.add(RolePermission(role_id=role_id, permission_id=permission.id))
    audit(db, actor, "role_permission_granted", role_id, table="roles", details={"permission":code})
    for user in db.query(User).filter_by(role_id=role_id).all():
        revoke_all(db, user.id)
    db.commit()
