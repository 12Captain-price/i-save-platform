from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BusinessTerms(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    office: str | None = Field(None, max_length=500)
    email: str | None = Field(None, max_length=255, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    office_phone: str | None = Field(None, pattern=r'^\+[0-9 ()-]{6,30}$')
    director_phone: str | None = Field(None, pattern=r'^\+[0-9 ()-]{6,30}$')
    additional_phone: str | None = Field(None, pattern=r'^\+[0-9 ()-]{6,30}$')
    registration_amount: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    registration_currency: str | None = Field(None, pattern=r'^[A-Z]{3}$')
    subscription_amount: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    subscription_currency: str | None = Field(None, pattern=r'^[A-Z]{3}$')
    subscription_start: Literal['next_calendar_month'] | None = None
    # Days 29–31 require an approved short-month rule. Do not invent one.
    subscription_due_day: int | None = Field(None, ge=1, le=28, strict=True)
    review_acknowledgement: str | None = Field(None, max_length=2000)
    require_national_id: bool = Field(default=False, strict=True)
    require_residence_evidence: bool = Field(default=False, strict=True)
    require_income_evidence: bool = Field(default=False, strict=True)
    require_evidence_acceptance: bool = Field(default=False, strict=True)
    document_retention_days: int | None = Field(default=None, ge=1, le=36500, strict=True)

    @model_validator(mode='after')
    def amounts(self):
        for key in ['registration_amount','subscription_amount']:
            if getattr(self,key) is not None:setattr(self,key,getattr(self,key).quantize(Decimal('0.01')))
        return self

    def missing(self):
        optional = {'subscription_due_day', 'document_retention_days', 'require_national_id', 'require_residence_evidence', 'require_income_evidence', 'require_evidence_acceptance'}
        return [k for k,v in self.model_dump().items() if k not in optional and not v]


class SettingsSave(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_key: UUID
    base_version: int = Field(ge=0, strict=True)
    terms: BusinessTerms


class SettingsPublish(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_key: UUID
    version_id: int = Field(gt=0, strict=True)
    effective_at: datetime | None = None
    @model_validator(mode='after')
    def timezone_required(self):
        if self.effective_at is not None and self.effective_at.utcoffset() is None:
            raise ValueError('Effective date must include a timezone')
        return self
