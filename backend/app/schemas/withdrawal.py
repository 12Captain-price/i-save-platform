from datetime import date,datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,StrictBool,field_validator


class RequestWithdrawal(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_key:UUID
    enrolment_id:int=Field(gt=0,strict=True)
    amount:Decimal=Field(gt=0,max_digits=12,decimal_places=2)
    currency:Literal['USD','ZWG']
    acknowledged:StrictBool
    @field_validator('acknowledged')
    @classmethod
    def acknowledgement_required(cls,value):
        if not value:raise ValueError('Explicit unticked acknowledgement is required')
        return value


class WithdrawalDecision(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_key:UUID
    base_event_id:int=Field(ge=0,strict=True)
    reason:str=Field(min_length=1,max_length=2000)
    evidence_reference:str=Field(min_length=1,max_length=200)
    method:Literal['manual_cash','manual_bank_record']|None=None
    payment_date:date|None=None
    payment_at:datetime|None=None
    @field_validator('payment_at')
    @classmethod
    def payout_timezone_required(cls,value):
        if value is not None and value.utcoffset() is None:raise ValueError('Actual payout time requires a timezone')
        return value
    payment_reference:str|None=Field(None,min_length=1,max_length=100)
