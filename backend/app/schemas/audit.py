"""Audit-event request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.common import TimestampSchema


class AuditEventRead(TimestampSchema):
    id: int
    event_type: str
    actor_user_id: Optional[int] = None
    actor_email: Optional[str] = None
    target_table: Optional[str] = None
    target_id: Optional[str] = None
    action: str
    details: Optional[str] = None
    ip_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
