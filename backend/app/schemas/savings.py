from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class Record(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_key: UUID
    enrolment_id: int = Field(gt=0, strict=True)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: Literal['USD', 'ZWG']
    payment_date: date
    method: str = Field(min_length=1, max_length=100)
    reference: str = Field(min_length=1, max_length=100)


class Decision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_key: UUID
    base_event_id: int = Field(ge=0, strict=True)
    outcome: Literal['Verified', 'Rejected', 'Matched', 'Discrepancy', 'Authorised', 'Reversed']
    evidence_reference: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=2000)
    observed_amount: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    observed_currency: Literal['USD', 'ZWG'] | None = None
    observed_reference: str | None = Field(None, min_length=1, max_length=100)
