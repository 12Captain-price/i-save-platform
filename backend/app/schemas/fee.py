"""Registration-fee request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Money, TimestampSchema

Reference = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class FeeBase(BaseModel):
    fee_reference: Reference
    member_id: int = Field(gt=0)
    amount: Money
    currency: Annotated[str, Field(min_length=3, max_length=10)] = "USD"
    status: Annotated[str, StringConstraints(min_length=1, max_length=50)] = "Pending"


class FeeCreate(FeeBase):
    pass


class FeeUpdate(BaseModel):
    status: Annotated[Optional[str], StringConstraints(min_length=1, max_length=50)] = None
    amount: Optional[Money] = None


class FeeRead(FeeBase, TimestampSchema):
    id: int
    paid_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
