"""Savings contribution business services.

A contribution is recorded as ``Pending verification``. It only becomes
confirmed savings once a verification record marks it ``Verified``.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.contribution import Contribution
from app.models.member import Member
from app.models.verification import PaymentVerification
from app.models.savings_plan import SavingsPlan
from app.models.user import User
from app.schemas.contribution import ContributionCreate


def create_contribution(db: Session, contribution_in: ContributionCreate, recorded_by: int) -> Contribution:
    member = db.query(Member).filter(Member.id == contribution_in.member_id).first()
    if not member:
        raise not_found("Member not found", {"member_id": contribution_in.member_id})
    if contribution_in.plan_id is not None:
        plan = db.query(SavingsPlan).filter(SavingsPlan.id == contribution_in.plan_id).first()
        if not plan:
            raise not_found("Savings plan not found", {"plan_id": contribution_in.plan_id})
    existing = (
        db.query(Contribution)
        .filter(Contribution.contribution_reference == contribution_in.contribution_reference)
        .first()
    )
    if existing:
        raise conflict(
            "Contribution reference already exists",
            {"contribution_reference": contribution_in.contribution_reference},
        )
    contribution = Contribution(
        **contribution_in.model_dump(),
        recorded_by=recorded_by,
    )
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    return contribution


def get_contribution(db: Session, contribution_id: int) -> Contribution | None:
    return db.query(Contribution).filter(Contribution.id == contribution_id).first()


def get_contribution_by_reference(db: Session, contribution_reference: str) -> Contribution | None:
    return (
        db.query(Contribution)
        .filter(Contribution.contribution_reference == contribution_reference)
        .first()
    )


def list_contributions(db: Session, skip: int = 0, limit: int = 100) -> list[Contribution]:
    return db.query(Contribution).offset(skip).limit(limit).all()


def verify_contribution(
    db: Session,
    contribution_id: int,
    verified_by: int,
    note: Optional[str] = None,
) -> Optional[Contribution]:
    """Mark a pending contribution as Verified and record the verification.

    Only the caller with authorisation (enforced by the router layer) should
    invoke this. A pending contribution is not confirmed savings until this
    step completes.
    """
    contribution = get_contribution(db, contribution_id)
    if not contribution:
        return None
    if contribution.status == "Verified":
        raise conflict("Contribution already verified", {"contribution_id": contribution_id})
    user = db.query(User).filter(User.id == verified_by).first()
    if not user:
        raise not_found("Verifying user not found", {"user_id": verified_by})
    contribution.status = "Verified"
    contribution.verified_by = verified_by
    contribution.verified_at = datetime.now(timezone.utc)
    db.add(contribution)

    verification = PaymentVerification(
        verification_reference=f"VER-{contribution.contribution_reference}",
        contribution_id=contribution.id,
        verified_by=verified_by,
        status="Verified",
        note=note,
    )
    db.add(verification)
    db.commit()
    db.refresh(contribution)
    return contribution


def reverse_contribution(db: Session, contribution_id: int, note: str) -> Optional[Contribution]:
    contribution = get_contribution(db, contribution_id)
    if not contribution:
        return None
    contribution.status = "Reversed"
    contribution.verified_by = None
    contribution.verified_at = None
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    return contribution


def confirmed_savings_total(db: Session, member_id: int) -> Decimal:
    """Sum of verified contributions only; pending contributions are excluded."""
    total = (
        db.query(Contribution.amount)
        .filter(Contribution.member_id == member_id, Contribution.status == "Verified")
        .all()
    )
    return sum((row[0] for row in total), Decimal("0"))
