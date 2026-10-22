"""Membership application request/response schemas."""
from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator, StrictBool
from typing_extensions import Annotated

from app.schemas.common import Email, TimestampSchema
from app.schemas.evidence import EvidenceUpload

Status = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class ApplicationBase(BaseModel):
    application_number: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    member_id: Optional[int] = Field(default=None, gt=0)
    first_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    last_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    email: Email
    phone: Annotated[Optional[str], Field(max_length=50)] = None
    address: Annotated[Optional[str], Field(max_length=255)] = None
    reason: Annotated[Optional[str], Field(max_length=1000)] = None
    status: Status = "Submitted"


class ApplicationCreate(ApplicationBase):
    model_config = ConfigDict(extra="forbid")
    status: Literal["Submitted"] = "Submitted"


class ApplicationUpdate(BaseModel):
    status: Optional[Status] = None
    reviewer_id: Optional[int] = Field(default=None, gt=0)
    rejection_reason: Annotated[Optional[str], Field(max_length=1000)] = None


class ApplicationRead(ApplicationBase, TimestampSchema):
    id: int
    submitted_at: datetime
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PublicRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    first_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    last_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    email: Email
    phone: Annotated[Optional[str], Field(max_length=50)] = None
    address: Annotated[Optional[str], Field(max_length=255)] = None
    reason: Annotated[Optional[str], Field(max_length=1000)] = None
    preferred_category: Optional[Literal['asset','holiday','emergency','retrenchment','education']] = None
    interest_notice_version: Annotated[Optional[str], Field(max_length=80)] = None
    national_id: str | None = Field(default=None, min_length=1, max_length=100, pattern=r'^[A-Za-z0-9 /-]+$')
    income_source: Literal['employed', 'self_employed', 'pension', 'other'] | None = None
    evidence: list[EvidenceUpload] = Field(default_factory=list, max_length=3)
    evidence_consent: StrictBool = False
    evidence_consent_version: str | None = Field(default=None, max_length=80)

    @model_validator(mode='after')
    def validate_interest(self):
        from app.schemas.evidence import CONSENT_VERSION
        if self.national_id or self.income_source or self.evidence or self.evidence_consent:
            if not self.evidence_consent or self.evidence_consent_version != CONSENT_VERSION:
                raise ValueError('Current evidence consent must be acknowledged')
        if len({f.kind for f in self.evidence}) != len(self.evidence):
            raise ValueError('One upload per evidence type is supported')
        from app.registration_options import OPTIONS
        if self.preferred_category is not None:
            if self.interest_notice_version != OPTIONS['version']:
                raise ValueError('Reload the current interest information before submitting')
        elif self.interest_notice_version is not None:
            raise ValueError('Choose a category before supplying an information version')
        return self


class SavingsInterestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category: str
    category_label: str
    purpose: str
    notice_version: str
    notice_text: str
    recorded_at: datetime


class AssistedRegistration(PublicRegistration):
    applicant_authorized: StrictBool
    authorization_version: Annotated[str, Field(max_length=80)]

    @model_validator(mode='after')
    def validate_authorization(self):
        from app.assisted_authorization import AUTHORIZATION
        if not self.applicant_authorized or self.authorization_version != AUTHORIZATION['version']:
            raise ValueError('Current applicant authorisation must be acknowledged')
        return self


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    source: str
    actor_user_id: Optional[int]
    actor_email: Optional[str]
    applicant_authorized: bool
    authorization_version: Optional[str]
    authorization_text: Optional[str]
    authorized_at: Optional[datetime]
    recorded_at: datetime


class ApplicationEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    note: Optional[str]
    actor_user_id: Optional[int]
    recorded_at: datetime
    actor_email: Optional[str] = None


class ApplicationDetail(ApplicationRead):
    submitted_at: datetime
    rejection_reason: Optional[str]
    history: list[ApplicationEventRead]
    savings_interest: Optional[SavingsInterestRead] = None
    submission: Optional[SubmissionRead] = None
