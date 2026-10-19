"""Member API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user, scoped_query, check_owned
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.member import Member
from app.schemas.member import MemberCreate, MemberRead, MemberUpdate, MemberPage
from app.services import member as member_service
from app.security.auth import require
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/v1/members", tags=["members"], dependencies=[Depends(resource_access("members"))])


@router.post("", response_model=MemberRead, status_code=201)
def create_member(
    member_in: MemberCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    return member_service.create_member(db, member_in)


@router.get("", response_model=list[MemberRead])
def list_members(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Member]:
    return scoped_query(db, Member, actor, "members").order_by(Member.id).offset(skip).limit(limit).all()


@router.get("/page", response_model=MemberPage, dependencies=[Depends(require("members:read"))])
def member_page(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query(max_length=100)] = "",
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> dict:
    query = member_service.search_members(scoped_query(db, Member, actor, "members"), q)
    return {"items": query.order_by(Member.id).offset(skip).limit(limit).all(),
            "total": query.count(), "skip": skip, "limit": limit}


@router.get("/{member_id}", response_model=MemberRead)
def get_member(
    actor: Annotated[Actor, Depends(current_user)],
    member_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    member = scoped_query(db, Member, actor, "members").filter(Member.id == member_id).first()
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


class AccountLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(gt=0)


@router.put("/{member_id}/account", status_code=204, dependencies=[Depends(require("users:write"))])
def link_account(member_id: int, body: AccountLink, actor: Actor = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import select
    from app.services.access import guard
    from app.services.auth import audit, revoke_all
    from app.exceptions import conflict
    guard(db, actor)
    user = db.execute(select(Actor).where(Actor.id == body.user_id).with_for_update()).scalar_one_or_none()
    member = db.execute(select(Member).where(Member.id == member_id).with_for_update()).scalar_one_or_none()
    if not user or not member:
        raise not_found("Member or account not found")
    if member.user_id is not None or db.query(Member).filter_by(user_id=user.id).first():
        raise conflict("Existing account links must not be overwritten")
    if not user.role or user.role.name != "member":
        raise conflict("Only a member account can be linked")
    member.user_id = user.id
    revoke_all(db, user.id)
    audit(db, actor, "member_account_linked", member.id, table="members", details={"user_id":user.id})
    db.commit()
