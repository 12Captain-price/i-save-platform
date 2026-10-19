"""Member API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.member import Member
from app.schemas.member import MemberCreate, MemberRead, MemberUpdate
from app.services import member as member_service

router = APIRouter(prefix="/api/v1/members", tags=["members"])


@router.post("", response_model=MemberRead, status_code=201)
def create_member(
    member_in: MemberCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    return member_service.create_member(db, member_in)


@router.get("", response_model=list[MemberRead])
def list_members(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Member]:
    return member_service.list_members(db, skip=skip, limit=limit)


@router.get("/{member_id}", response_model=MemberRead)
def get_member(
    member_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    member = member_service.get_member(db, member_id)
    if not member:
        raise not_found("Member not found", {"member_id": member_id})
    return member


@router.patch("/{member_id}", response_model=MemberRead)
def update_member(
    member_id: Annotated[int, Path(gt=0)],
    member_in: MemberUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    member = member_service.update_member(db, member_id, member_in)
    if not member:
        raise not_found("Member not found", {"member_id": member_id})
    return member
