"""Registration-fee API router."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user, scoped_query, check_owned, unconfigured
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.registration_fee import RegistrationFee
from app.schemas.fee import FeeCreate, FeeRead, FeeUpdate
from app.services import fee as fee_service

router = APIRouter(prefix="/api/v1/fees", tags=["fees"], dependencies=[Depends(resource_access("fees"))])


@router.post("", response_model=FeeRead, status_code=201)
def create_fee(
    fee_in: FeeCreate,
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    return fee_service.create_fee(db, fee_in)


@router.get("", response_model=list[FeeRead])
def list_fees(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[RegistrationFee]:
    return scoped_query(db, RegistrationFee, actor, "fees").order_by(RegistrationFee.id).offset(skip).limit(limit).all()


@router.get("/{fee_id}", response_model=FeeRead)
def get_fee(
    actor: Annotated[Actor, Depends(current_user)],
    fee_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    fee = scoped_query(db, RegistrationFee, actor, "fees").filter(RegistrationFee.id == fee_id).first()
    if not fee:
        raise not_found("Fee not found", {"fee_id": fee_id})
    return fee


@router.patch("/{fee_id}/paid", response_model=FeeRead, dependencies=[Depends(unconfigured)])
def mark_fee_paid(
    fee_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    fee = fee_service.mark_fee_paid(db, fee_id)
    if not fee:
        raise not_found("Fee not found", {"fee_id": fee_id})
    return fee
