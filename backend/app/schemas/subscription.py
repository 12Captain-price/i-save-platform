"""Monthly subscription request/response schemas."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Money, TimestampSchema

Reference = Annotated[str, StringConstraints(min_length=1, max_length=50)]
PeriodMonth = Annotated[str, StringConstraints(min_length=7, max_length=7, pattern=r"^\d{4}-\d{2}$")]


class SubscriptionBase(BaseModel):
    subscription_reference: Reference
    member_id: int = Field(gt=0)
    period_month: PeriodMonth
    amount: Money
    currency: Annotated[str, Field(min_length=3, max_length=10)] = "USD"
    status: Annotated[str, StringConstraints(min_length=1, max_length=50)] = "Pending"
    due_date: Optional[date] = None


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    status: Annotated[Optional[str], StringConstraints(min_length=1, max_length=50)] = None
    amount: Optional[Money] = None
    due_date: Optional[date] = None


class SubscriptionRead(SubscriptionBase, TimestampSchema):
    id: int
    paid_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
