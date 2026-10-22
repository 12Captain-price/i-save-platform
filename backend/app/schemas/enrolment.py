from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

ACK_VERSION = 'plan-application-v1'
ACK_TEXT = 'I have read the displayed plan information and would like to apply. I understand that submitting an application does not approve membership, activate enrolment or confirm payment.'
WITHDRAWAL_TEXT = 'Withdrawal requests become eligible only after programme completion and require at least two weeks’ notice from the request, plus authorised review. Withdrawal processing is unavailable in this milestone.'
MISSED_TEXT = 'Missed weekly targets do not automatically create penalties, deductions, debt or suspension. No automatic collection is enabled.'


class PlanAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_key: UUID
    version: int = Field(gt=0, strict=True)
    acknowledged: StrictBool
    effective_at: datetime | None = None

    @model_validator(mode='after')
    def valid(self):
        if not self.acknowledged:raise ValueError('Explicit terms approval is required')
        if self.effective_at and self.effective_at.utcoffset() is None:raise ValueError('Effective date must include timezone')
        return self


class PlanApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_key: UUID
    version_id: int = Field(gt=0, strict=True)
    weekly_target: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    acknowledged: StrictBool
    acknowledgement_version: Literal['plan-application-v1']
    @model_validator(mode='after')
    def valid(self):
        if not self.acknowledged:raise ValueError('Read and acknowledge the displayed terms')
        return self


class PlanDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    base_status: Literal['Pending','Approved']
    outcome: Literal['Approved','Rejected']
    reason: str = Field(min_length=1, max_length=2000)


class EnrolmentActivate(BaseModel):
    model_config = ConfigDict(extra='forbid')
