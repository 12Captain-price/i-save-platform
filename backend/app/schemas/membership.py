from datetime import date
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,StrictBool,model_validator


class PaymentRecord(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    amount: Decimal=Field(gt=0,max_digits=12,decimal_places=2)
    currency: str=Field(pattern=r'^[A-Z]{3}$')
    payment_date: date
    reference: str=Field(min_length=1,max_length=80)


class ReviewAcknowledgement(BaseModel):
    model_config=ConfigDict(extra='forbid')
    acknowledged: StrictBool
    acknowledgement_version: str=Field(max_length=80)
    @model_validator(mode='after')
    def current_ack(self):
        if not self.acknowledged:
            raise ValueError('Current reviewer acknowledgement is required')
        return self


class InvitationRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    request_key: UUID


class PasswordSetup(BaseModel):
    model_config=ConfigDict(extra='forbid')
    token: str=Field(pattern=r'^[A-Za-z0-9_-]{43}$',repr=False)
    password: str=Field(min_length=12,max_length=72,repr=False)
    @model_validator(mode='after')
    def password_bytes(self):
        if len(self.password.encode('utf-8'))>72:raise ValueError('Password must be at most 72 UTF-8 bytes')
        return self
