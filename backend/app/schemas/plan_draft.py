from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,model_validator


class DraftTerms(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    category: Literal['asset','holiday','emergency','retrenchment','education']|None=None
    description: str|None=Field(default=None,max_length=4000)
    currency: str|None=Field(default=None,pattern=r'^[A-Z]{3}$')
    contribution_mode: Literal['fixed','member_chosen']|None=None
    fixed_amount: Decimal|None=Field(default=None,gt=0,max_digits=12,decimal_places=2)
    minimum_amount: Decimal|None=Field(default=None,gt=0,max_digits=12,decimal_places=2)
    maximum_amount: Decimal|None=Field(default=None,gt=0,max_digits=12,decimal_places=2)
    cadence: Literal['weekly']|None=None
    duration_mode: Literal['fixed','open_ended','calendar_months']|None=None
    duration_weeks: int|None=Field(default=None,ge=1,strict=True)
    duration_months: int|None=Field(default=None,ge=1,le=120,strict=True)
    missed_target_policy: Literal['no_automatic_consequences']|None=None
    extra_contribution_policy: Literal['voluntary_no_automatic_posting']|None=None
    withdrawal_access: Literal['after_completion_14_days_notice_review_unavailable']|None=None
    benefits_policy: Literal['unavailable']|None=None
    missed_contributions: str|None=Field(default=None,max_length=4000)
    extra_contributions: str|None=Field(default=None,max_length=4000)

    @model_validator(mode='after')
    def consistent(self):
        if self.minimum_amount is not None and self.maximum_amount is not None and self.minimum_amount>self.maximum_amount:
            raise ValueError('Minimum amount cannot exceed maximum')
        if self.contribution_mode=='member_chosen' and self.fixed_amount is not None:
            raise ValueError('Member-chosen mode cannot include a fixed amount')
        if self.fixed_amount is not None:
            if self.minimum_amount is not None and self.fixed_amount<self.minimum_amount:raise ValueError('Fixed amount below minimum')
            if self.maximum_amount is not None and self.fixed_amount>self.maximum_amount:raise ValueError('Fixed amount above maximum')
        if self.duration_mode=='open_ended' and self.duration_weeks is not None:raise ValueError('Open-ended duration cannot include a fixed week count')
        if self.duration_mode=='calendar_months' and self.duration_weeks is not None:raise ValueError('Calendar-month duration cannot include weeks')
        if self.duration_mode in {'fixed','open_ended'} and self.duration_months is not None:raise ValueError('Calendar months require calendar-month duration mode')
        return self

    def missing(self):
        fields=['category','description','currency','contribution_mode','cadence','duration_mode','missed_contributions','extra_contributions']
        missing=[f for f in fields if not getattr(self,f)]
        if self.contribution_mode=='fixed' and self.fixed_amount is None:missing.append('fixed_amount')
        if self.duration_mode=='fixed' and self.duration_weeks is None:missing.append('duration_weeks')
        if self.duration_mode=='calendar_months' and self.duration_months is None:missing.append('duration_months')
        return missing


class DraftSave(BaseModel):
    model_config=ConfigDict(extra='forbid')
    request_key: UUID
    base_version: int=Field(ge=0,strict=True)
    terms: DraftTerms
