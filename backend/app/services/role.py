"""Role business services."""
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.schemas.role import RoleCreate, RoleUpdate


def create_role(db: Session, role_in: RoleCreate) -> Role:
    existing = db.query(Role).filter(Role.name == role_in.name).first()
    if existing:
        raise conflict("Role already exists", {"name": role_in.name})
    role = Role(name=role_in.name, description=role_in.description)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def get_role(db: Session, role_id: int) -> Role | None:
    return db.query(Role).filter(Role.id == role_id).first()


def get_role_by_name(db: Session, name: str) -> Role | None:
    return db.query(Role).filter(Role.name == name).first()


def list_roles(db: Session, skip: int = 0, limit: int = 100) -> list[Role]:
    return db.query(Role).offset(skip).limit(limit).all()


def update_role(db: Session, role_id: int, role_in: RoleUpdate) -> Optional[Role]:
    role = get_role(db, role_id)
    if not role:
        return None
    data = role_in.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != role.name:
        existing = get_role_by_name(db, data["name"])
        if existing and existing.id != role_id:
            raise conflict("Role already exists", {"name": data["name"]})
    for field, value in data.items():
        setattr(role, field, value)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def grant_permission(db: Session, role_id: int, permission_code: str) -> None:
    role = get_role(db, role_id)
    if not role:
        raise not_found("Role not found", {"role_id": role_id})
    permission = db.query(Permission).filter(Permission.code == permission_code).first()
    if not permission:
        raise not_found("Permission not found", {"code": permission_code})
    existing = (
        db.query(RolePermission)
        .filter(RolePermission.role_id == role_id, RolePermission.permission_id == permission.id)
        .first()
    )
    if existing:
        return
    db.add(RolePermission(role_id=role_id, permission_id=permission.id))
    db.commit()
