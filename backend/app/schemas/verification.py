"""Payment verification request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import TimestampSchema

Reference = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class VerificationBase(BaseModel):
    verification_reference: Reference
    contribution_id: Optional[int] = Field(default=None, gt=0)
    subscription_id: Optional[int] = Field(default=None, gt=0)
    registration_fee_id: Optional[int] = Field(default=None, gt=0)
    verified_by: int = Field(gt=0)
    status: Annotated[str, StringConstraints(min_length=1, max_length=50)] = "Verified"
    note: Annotated[Optional[str], Field(max_length=1000)] = None


class VerificationCreate(VerificationBase):
    pass


class VerificationRead(VerificationBase, TimestampSchema):
    id: int

    model_config = ConfigDict(from_attributes=True)
