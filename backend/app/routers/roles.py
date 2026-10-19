"""Role API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleRead, RoleUpdate
from app.services import role as role_service

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


@router.post("", response_model=RoleRead, status_code=201)
def create_role(
    role_in: RoleCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Role:
    return role_service.create_role(db, role_in)


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
    role_id: Annotated[int, Path(gt=0)],
    role_in: RoleUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> Role:
    role = role_service.update_role(db, role_id, role_in)
    if not role:
        raise not_found("Role not found", {"role_id": role_id})
    return role


@router.post("/{role_id}/permissions/{permission_code}", status_code=204)
def grant_permission(
    role_id: Annotated[int, Path(gt=0)],
    permission_code: str,
    db: Annotated[Session, Depends(get_db)],
):
    role_service.grant_permission(db, role_id, permission_code)
    return None
