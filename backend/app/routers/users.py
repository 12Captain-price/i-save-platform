"""User account API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user as user_service
from app.services import access
from app.services.auth import audit, revoke_all
from app.security.auth import require
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/api/v1/users", tags=["users"], dependencies=[Depends(resource_access("users"))])


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    actor: Annotated[Actor, Depends(current_user)],
    user_in: UserCreate,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    return access.create_user(db, actor, user_in)


@router.get("", response_model=list[UserRead])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[User]:
    return user_service.list_users(db, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = user_service.get_user(db, user_id)
    if not user:
        raise not_found("User not found", {"user_id": user_id})
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    actor: Annotated[Actor, Depends(current_user)],
    user_id: Annotated[int, Path(gt=0)],
    user_in: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = access.update_user(db, actor, user_id, user_in)
    if not user:
        raise not_found("User not found", {"user_id": user_id})
    return user


class PermissionOverride(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    allowed: bool


@router.put("/{user_id}/permissions/{code}", status_code=204, dependencies=[Depends(require("users:write"))])
def override_permission(user_id: int, code: str, body: PermissionOverride,
                        actor: Actor = Depends(current_user), db: Session = Depends(get_db)):
    access.override_permission(db, actor, user_id, code, body.allowed)


@router.delete("/{user_id}/permissions/{code}", status_code=204)
def remove_override(user_id: int, code: str, actor: Actor = Depends(current_user), db: Session = Depends(get_db)):
    access.override_permission(db, actor, user_id, code, None)


@router.delete("/{user_id}/sessions", status_code=204)
def revoke_sessions(user_id: int, actor: Actor = Depends(current_user), db: Session = Depends(get_db)):
    access.guard(db, actor)
    from sqlalchemy import select
    target = db.execute(select(User).where(User.id == user_id).with_for_update()).scalar_one_or_none()
    if not target:
        raise not_found("User not found")
    revoke_all(db, user_id)
    audit(db, actor, "sessions_revoked", user_id)
    db.commit()
