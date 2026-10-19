from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,StrictBool,model_validator
from app.membership_policy import POLICY


class PaymentRecord(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    amount: Decimal=Field(decimal_places=2)
    currency: Literal['USD']
    payment_date: date
    reference: str=Field(min_length=1,max_length=80)
    @model_validator(mode='after')
    def fixed_fee(self):
        if self.amount!=Decimal('20.00'):raise ValueError('Registration fee must be US$20')
        return self


class ReviewAcknowledgement(BaseModel):
    model_config=ConfigDict(extra='forbid')
    acknowledged: StrictBool
    acknowledgement_version: str=Field(max_length=80)
    @model_validator(mode='after')
    def current_ack(self):
        if not self.acknowledged or self.acknowledgement_version!=POLICY['acknowledgement_version']:
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
