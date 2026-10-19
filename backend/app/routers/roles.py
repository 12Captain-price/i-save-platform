"""Role API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleRead, RoleUpdate
from app.services import role as role_service
from app.services import access

router = APIRouter(prefix="/api/v1/roles", tags=["roles"], dependencies=[Depends(resource_access("roles"))])


@router.post("", response_model=RoleRead, status_code=201)
def create_role(
    actor: Annotated[Actor, Depends(current_user)],
    role_in: RoleCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Role:
    return access.create_role(db, actor, role_in)


@router.get("", response_model=list[RoleRead])
def list_roles(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Role]:
    return role_service.list_roles(db, skip=skip, limit=limit)


@router.get("/{role_id}", response_model=RoleRead)
def get_role(
    role_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Role:
    role = role_service.get_role(db, role_id)
    if not role:
        raise not_found("Role not found", {"role_id": role_id})
    return role


@router.patch("/{role_id}", response_model=RoleRead)
def update_role(
    actor: Annotated[Actor, Depends(current_user)],
    role_id: Annotated[int, Path(gt=0)],
    role_in: RoleUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> Role:
    role = access.update_role(db, actor, role_id, role_in)
    if not role:
        raise not_found("Role not found", {"role_id": role_id})
    return role


@router.post("/{role_id}/permissions/{permission_code}", status_code=204)
def grant_permission(
    actor: Annotated[Actor, Depends(current_user)],
    role_id: Annotated[int, Path(gt=0)],
    permission_code: str,
    db: Annotated[Session, Depends(get_db)],
):
    access.grant_permission(db, actor, role_id, permission_code)
    return None
