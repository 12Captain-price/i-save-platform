"""Registration-fee API router."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.registration_fee import RegistrationFee
from app.schemas.fee import FeeCreate, FeeRead, FeeUpdate
from app.services import fee as fee_service

router = APIRouter(prefix="/api/v1/fees", tags=["fees"])


@router.post("", response_model=FeeRead, status_code=201)
def create_fee(
    fee_in: FeeCreate,
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    return fee_service.create_fee(db, fee_in)


@router.get("", response_model=list[FeeRead])
def list_fees(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[RegistrationFee]:
    return fee_service.list_fees(db, skip=skip, limit=limit)


@router.get("/{fee_id}", response_model=FeeRead)
def get_fee(
    fee_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    fee = fee_service.get_fee(db, fee_id)
    if not fee:
        raise not_found("Fee not found", {"fee_id": fee_id})
    return fee


@router.patch("/{fee_id}/paid", response_model=FeeRead)
def mark_fee_paid(
    fee_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> RegistrationFee:
    fee = fee_service.mark_fee_paid(db, fee_id)
    if not fee:
        raise not_found("Fee not found", {"fee_id": fee_id})
    return fee
