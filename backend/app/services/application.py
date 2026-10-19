"""Membership application business services."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.application import MembershipApplication
from app.schemas.application import ApplicationCreate, ApplicationUpdate


def create_application(db: Session, application_in: ApplicationCreate) -> MembershipApplication:
    existing = (
        db.query(MembershipApplication)
        .filter(MembershipApplication.application_number == application_in.application_number)
        .first()
    )
    if existing:
        raise conflict("Application number already exists", {"application_number": application_in.application_number})
    application = MembershipApplication(**application_in.model_dump())
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def get_application(db: Session, application_id: int) -> MembershipApplication | None:
    return db.query(MembershipApplication).filter(MembershipApplication.id == application_id).first()


def get_application_by_number(db: Session, application_number: str) -> MembershipApplication | None:
    return (
        db.query(MembershipApplication)
        .filter(MembershipApplication.application_number == application_number)
        .first()
    )


def list_applications(db: Session, skip: int = 0, limit: int = 100) -> list[MembershipApplication]:
    return db.query(MembershipApplication).offset(skip).limit(limit).all()


def decide_application(
    db: Session, application_id: int, status: str, reviewer_id: int, rejection_reason: Optional[str] = None
) -> MembershipApplication | None:
    application = get_application(db, application_id)
    if not application:
        return None
    application.status = status
    application.reviewed_by = reviewer_id
    application.reviewed_at = datetime.now(timezone.utc)
    if status == "Rejected":
        application.rejection_reason = rejection_reason
    else:
        application.rejection_reason = None
    db.add(application)
    db.commit()
    db.refresh(application)
    return application
