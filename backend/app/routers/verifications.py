"""Payment verification API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, unconfigured
from app.models.verification import PaymentVerification
from app.schemas.verification import VerificationRead
from app.services import verification as verification_service

router = APIRouter(prefix="/api/v1/verifications", tags=["verifications"], dependencies=[Depends(resource_access("verifications"))])


@router.post("", response_model=VerificationRead, status_code=201, dependencies=[Depends(unconfigured)])
def create_verification(
) -> PaymentVerification:
    # No generic write contract until transactional financial rules are approved.
    unconfigured()


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
