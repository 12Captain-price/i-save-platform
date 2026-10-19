"""Audit-event business services."""
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def log_event(
    db: Session,
    *,
    event_type: str,
    action: str,
    actor_user_id: Optional[int] = None,
    actor_email: Optional[str] = None,
    target_table: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditEvent:
    import json

    event = AuditEvent(
        event_type=event_type,
        action=action,
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        target_table=target_table,
        target_id=target_id,
        details=json.dumps(details, default=str) if details is not None else None,
        ip_address=ip_address,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_audit_events(db: Session, skip: int = 0, limit: int = 100) -> list[AuditEvent]:
    return db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).offset(skip).limit(limit).all()
