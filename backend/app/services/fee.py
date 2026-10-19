"""Registration-fee business services."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.member import Member
from app.models.registration_fee import RegistrationFee
from app.schemas.fee import FeeCreate, FeeUpdate


def create_fee(db: Session, fee_in: FeeCreate) -> RegistrationFee:
    from app.services.membership import reference_lock
    from app.models.membership import ApplicationRegistrationPayment
    from app.security.auth import digest
    from sqlalchemy import func
    reference_lock(db,fee_in.fee_reference)
    if db.query(ApplicationRegistrationPayment).filter_by(reference_key=digest(fee_in.fee_reference.strip().lower())).first():
        raise conflict('Receipt/reference is already recorded')
    member = db.query(Member).filter(Member.id == fee_in.member_id).first()
    if not member:
        raise not_found("Member not found", {"member_id": fee_in.member_id})
    existing = (
        db.query(RegistrationFee)
        .filter(RegistrationFee.fee_reference == fee_in.fee_reference)
        .first()
    )
    if existing:
        raise conflict("Fee reference already exists", {"fee_reference": fee_in.fee_reference})
    fee = RegistrationFee(**fee_in.model_dump())
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee


def get_fee(db: Session, fee_id: int) -> RegistrationFee | None:
    return db.query(RegistrationFee).filter(RegistrationFee.id == fee_id).first()


def list_fees(db: Session, skip: int = 0, limit: int = 100) -> list[RegistrationFee]:
    return db.query(RegistrationFee).offset(skip).limit(limit).all()


def mark_fee_paid(db: Session, fee_id: int) -> Optional[RegistrationFee]:
    fee = get_fee(db, fee_id)
    if not fee:
        return None
    fee.status = "Paid"
    fee.paid_at = datetime.utcnow()
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee
