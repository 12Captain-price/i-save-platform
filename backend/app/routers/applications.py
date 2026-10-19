"""Membership application API router."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user, scoped_query, check_owned, unconfigured
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.application import MembershipApplication, ApplicationEvent, SavingsInterest
from app.schemas.application import ApplicationCreate, ApplicationRead, ApplicationUpdate, ApplicationDetail
from app.schemas.common import Paginated
from app.security.auth import require
from app.services import application as application_service

router = APIRouter(prefix="/api/v1/applications", tags=["applications"], dependencies=[Depends(resource_access("applications"))])


@router.post("", response_model=ApplicationRead, status_code=201)
def create_application(
    application_in: ApplicationCreate,
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MembershipApplication:
    return application_service.create_application(db, application_in, actor.id)


@router.get("", response_model=list[ApplicationRead])
def list_applications(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[MembershipApplication]:
    return scoped_query(db, MembershipApplication, actor, "applications").order_by(MembershipApplication.id).offset(skip).limit(limit).all()


@router.get("/page", response_model=Paginated[ApplicationRead], dependencies=[Depends(require("applications:read"))])
def page_applications(db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query(max_length=100)] = "",
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 10):
    query = db.query(MembershipApplication)
    if q.strip():
        fields = (MembershipApplication.application_number, MembershipApplication.first_name,
            MembershipApplication.last_name, MembershipApplication.first_name + " " + MembershipApplication.last_name,
            MembershipApplication.email, MembershipApplication.phone, MembershipApplication.status)
        query = query.filter(or_(*(field.icontains(q.strip(), autoescape=True) for field in fields)))
    return {"items": query.order_by(MembershipApplication.id.desc()).offset(skip).limit(limit).all(),
            "total":query.count(), "skip":skip, "limit":limit}


@router.get("/review/{application_id}", response_model=ApplicationDetail, dependencies=[Depends(require("applications:read"))])
def review_application(application_id: Annotated[int, Path(gt=0)], db: Annotated[Session, Depends(get_db)]):
    application = db.get(MembershipApplication, application_id)
    if not application:
        raise not_found("Application not found")
    data = ApplicationRead.model_validate(application).model_dump()
    return {**data, "submitted_at":application.submitted_at, "rejection_reason":application.rejection_reason,
        "history":db.query(ApplicationEvent).filter_by(application_id=application_id).order_by(ApplicationEvent.id).all(),
        "savings_interest":db.query(SavingsInterest).filter_by(application_id=application_id).one_or_none()}


@router.get("/{application_id}", response_model=ApplicationRead)
def get_application(
    actor: Annotated[Actor, Depends(current_user)],
    application_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> MembershipApplication:
    application = scoped_query(db, MembershipApplication, actor, "applications").filter(MembershipApplication.id == application_id).first()
    if not application:
        raise not_found("Application not found", {"application_id": application_id})
    return application


@router.patch("/{application_id}/decision", response_model=ApplicationRead, dependencies=[Depends(unconfigured)])
def decide_application(
    application_id: Annotated[int, Path(gt=0)],
    status: str,
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    rejection_reason: Optional[str] = None,
) -> MembershipApplication:
    application = application_service.decide_application(
        db, application_id, status=status, reviewer_id=actor.id, rejection_reason=rejection_reason
    )
    if not application:
        raise not_found("Application not found", {"application_id": application_id})
    return application
