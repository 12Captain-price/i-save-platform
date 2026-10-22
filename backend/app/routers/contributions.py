"""Savings contribution API router."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user, scoped_query, check_owned, unconfigured
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.contribution import Contribution
from app.schemas.contribution import ContributionCreate, ContributionRead
from app.services import contribution as contribution_service

router = APIRouter(prefix="/api/v1/contributions", tags=["contributions"], dependencies=[Depends(resource_access("contributions"))])


@router.post("", response_model=ContributionRead, status_code=201, dependencies=[Depends(unconfigured)])
def create_contribution(
    contribution_in: ContributionCreate,
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Contribution:
    return contribution_service.create_contribution(db, contribution_in, recorded_by=actor.id)


@router.get("", response_model=list[ContributionRead])
def list_contributions(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Contribution]:
    return scoped_query(db, Contribution, actor, "contributions").order_by(Contribution.id).offset(skip).limit(limit).all()


@router.get("/{contribution_id}", response_model=ContributionRead)
def get_contribution(
    actor: Annotated[Actor, Depends(current_user)],
    contribution_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Contribution:
    contribution = scoped_query(db, Contribution, actor, "contributions").filter(Contribution.id == contribution_id).first()
    if not contribution:
        raise not_found("Contribution not found", {"contribution_id": contribution_id})
    return contribution


@router.post("/{contribution_id}/verify", response_model=ContributionRead, dependencies=[Depends(unconfigured)])
def verify_contribution(
    contribution_id: Annotated[int, Path(gt=0)],
    actor: Annotated[Actor, Depends(current_user)],
    note: Optional[str] = None,
    db: Annotated[Session, Depends(get_db)] = None,
) -> Contribution:
    contribution = contribution_service.verify_contribution(
        db, contribution_id, verified_by=actor.id, note=note
    )
    if not contribution:
        raise not_found("Contribution not found", {"contribution_id": contribution_id})
    return contribution


@router.post("/{contribution_id}/reverse", response_model=ContributionRead, dependencies=[Depends(unconfigured)])
def reverse_contribution(
    contribution_id: Annotated[int, Path(gt=0)],
    note: str,
    db: Annotated[Session, Depends(get_db)] = None,
) -> Contribution:
    contribution = contribution_service.reverse_contribution(db, contribution_id, note=note)
    if not contribution:
        raise not_found("Contribution not found", {"contribution_id": contribution_id})
    return contribution


@router.get("/{member_id}/confirmed-total")
def confirmed_savings_total(
    actor: Annotated[Actor, Depends(current_user)],
    member_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    """Confirmed savings for a member: verified contributions only."""
    from app.models.member import Member
    member = scoped_query(db, Member, actor, "contributions").filter(Member.id == member_id).first()
    if not member:
        raise not_found("Member not found")
    from app.services.savings import summary
    return {'member_id':member_id, **summary(db,member_id)}
