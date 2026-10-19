"""Savings contribution request/response schemas."""
from datetime import date, datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Money, TimestampSchema

Reference = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class ContributionBase(BaseModel):
    contribution_reference: Reference
    member_id: int = Field(gt=0)
    plan_id: Optional[int] = Field(default=None, gt=0)
    amount: Money
    currency: Annotated[str, Field(min_length=3, max_length=10)] = "USD"
    status: Annotated[str, StringConstraints(min_length=1, max_length=50)] = "Pending verification"
    received_date: Optional[date] = None
    reference: Annotated[Optional[str], Field(max_length=100)] = None


class ContributionCreate(ContributionBase):
    model_config = ConfigDict(extra="forbid")
    status: Literal["Pending verification"] = "Pending verification"


class ContributionUpdate(BaseModel):
    status: Annotated[Optional[str], StringConstraints(min_length=1, max_length=50)] = None
    amount: Optional[Money] = None


class ContributionRead(ContributionBase, TimestampSchema):
    id: int
    recorded_by: Optional[int] = None
    verified_by: Optional[int] = None
    verified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
