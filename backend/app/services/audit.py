"""Audit-event business services."""
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def log_event(
    db: Session,
    *,
    event_type: str,
    action: str,
    actor=None,
    system_source: Optional[str] = None,
    target_table: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditEvent:
    import json

    if (actor is None) == (system_source is None):
        raise ValueError('Provide a server-authenticated actor or explicit system source')
    if system_source:
        details={**(details or {}),'system_source':system_source}

    event = AuditEvent(
        event_type=event_type,
        action=action,
        actor_user_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        target_table=target_table,
        target_id=target_id,
        details=json.dumps(details, default=str) if details is not None else None,
        ip_address=ip_address,
    )
    db.add(event)
    db.flush()  # caller owns the transaction; audit cannot commit financial work early
    return event


def list_audit_events(db: Session, skip: int = 0, limit: int = 100) -> list[AuditEvent]:
    return db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).offset(skip).limit(limit).all()
