"""Payment verification business services."""
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.verification import PaymentVerification
from app.models.user import User
from app.schemas.verification import VerificationCreate


def create_verification(db: Session, verification_in: VerificationCreate) -> PaymentVerification:
    if verification_in.verified_by:
        user = db.query(User).filter(User.id == verification_in.verified_by).first()
        if not user:
            raise not_found("Verifying user not found", {"user_id": verification_in.verified_by})
    existing = (
        db.query(PaymentVerification)
        .filter(PaymentVerification.verification_reference == verification_in.verification_reference)
        .first()
    )
    if existing:
        raise conflict(
            "Verification reference already exists",
            {"verification_reference": verification_in.verification_reference},
        )
    verification = PaymentVerification(**verification_in.model_dump())
    db.add(verification)
    db.commit()
    db.refresh(verification)
    return verification


def get_verification(db: Session, verification_id: int) -> PaymentVerification | None:
    return db.query(PaymentVerification).filter(PaymentVerification.id == verification_id).first()


def list_verifications(db: Session, skip: int = 0, limit: int = 100) -> list[PaymentVerification]:
    return db.query(PaymentVerification).offset(skip).limit(limit).all()
