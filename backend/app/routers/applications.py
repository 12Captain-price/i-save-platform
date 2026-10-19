"""Membership application API router."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.application import MembershipApplication
from app.schemas.application import ApplicationCreate, ApplicationRead, ApplicationUpdate
from app.services import application as application_service

router = APIRouter(prefix="/api/v1/applications", tags=["applications"])


@router.post("", response_model=ApplicationRead, status_code=201)
def create_application(
    application_in: ApplicationCreate,
    db: Annotated[Session, Depends(get_db)],
) -> MembershipApplication:
    return application_service.create_application(db, application_in)


@router.get("", response_model=list[ApplicationRead])
def list_applications(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[MembershipApplication]:
    return application_service.list_applications(db, skip=skip, limit=limit)


@router.get("/{application_id}", response_model=ApplicationRead)
def get_application(
    application_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> MembershipApplication:
    application = application_service.get_application(db, application_id)
    if not application:
        raise not_found("Application not found", {"application_id": application_id})
    return application


@router.patch("/{application_id}/decision", response_model=ApplicationRead)
def decide_application(
    application_id: Annotated[int, Path(gt=0)],
    status: str,
    reviewer_id: Annotated[int, Query(gt=0)],
    db: Annotated[Session, Depends(get_db)],
    rejection_reason: Optional[str] = None,
) -> MembershipApplication:
    application = application_service.decide_application(
        db, application_id, status=status, reviewer_id=reviewer_id, rejection_reason=rejection_reason
    )
    if not application:
        raise not_found("Application not found", {"application_id": application_id})
    return application
