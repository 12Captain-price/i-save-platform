"""Membership application request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Email, TimestampSchema

Status = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class ApplicationBase(BaseModel):
    application_number: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    member_id: Optional[int] = Field(default=None, gt=0)
    first_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    last_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    email: Email
    phone: Annotated[Optional[str], Field(max_length=50)] = None
    address: Annotated[Optional[str], Field(max_length=255)] = None
    reason: Annotated[Optional[str], Field(max_length=1000)] = None
    status: Status = "Submitted"


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(BaseModel):
    status: Optional[Status] = None
    reviewer_id: Optional[int] = Field(default=None, gt=0)
    rejection_reason: Annotated[Optional[str], Field(max_length=1000)] = None


class ApplicationRead(ApplicationBase, TimestampSchema):
    id: int
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
