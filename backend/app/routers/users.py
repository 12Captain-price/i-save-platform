"""User account API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user as user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    user_in: UserCreate,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    return user_service.create_user(db, user_in)


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
    user_id: Annotated[int, Path(gt=0)],
    user_in: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = user_service.update_user(db, user_id, user_in)
    if not user:
        raise not_found("User not found", {"user_id": user_id})
    return user
