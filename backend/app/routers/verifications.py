"""Payment verification API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.verification import PaymentVerification
from app.schemas.verification import VerificationCreate, VerificationRead
from app.services import verification as verification_service

router = APIRouter(prefix="/api/v1/verifications", tags=["verifications"])


@router.post("", response_model=VerificationRead, status_code=201)
def create_verification(
    verification_in: VerificationCreate,
    db: Annotated[Session, Depends(get_db)],
) -> PaymentVerification:
    return verification_service.create_verification(db, verification_in)


@router.get("", response_model=list[VerificationRead])
def list_verifications(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[PaymentVerification]:
    return verification_service.list_verifications(db, skip=skip, limit=limit)


@router.get("/{verification_id}", response_model=VerificationRead)
def get_verification(
    verification_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> PaymentVerification:
    from app.exceptions import not_found

    verification = verification_service.get_verification(db, verification_id)
    if not verification:
        raise not_found("Verification not found", {"verification_id": verification_id})
    return verification
