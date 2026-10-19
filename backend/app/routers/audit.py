"""Audit-event API router (read-only)."""
from typing import Annotated, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access
from app.models.audit_event import AuditEvent
from app.schemas.audit import AuditEventRead
from app.services import audit as audit_service

router = APIRouter(prefix="/api/v1/audit", tags=["audit"], dependencies=[Depends(resource_access("audit"))])


@router.get("", response_model=List[AuditEventRead])
def list_audit_events(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> List[AuditEventRead]:
    return audit_service.list_audit_events(db, skip=skip, limit=limit)
