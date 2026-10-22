from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool

CONSENT_VERSION = 'registration-evidence-v1'
CONSENT_TEXT = 'I authorise i-Save to collect and privately review the identity, residence and income information submitted with this application. This does not approve membership, a plan or payment.'
KINDS = ('residence', 'income', 'self_employed')


class EvidenceUpload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['residence', 'income', 'self_employed']
    filename: str = Field(min_length=1, max_length=120)
    content_type: Literal['image/png', 'image/jpeg']
    data: str = Field(min_length=1, max_length=2796204)


class EvidenceReplace(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_key: UUID
    replaces_id: int | None = Field(default=None, gt=0)
    evidence: EvidenceUpload
    applicant_authorized: StrictBool
    consent_version: str


class EvidenceDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_key: UUID
    base_review_id: int = Field(ge=0, strict=True)
    outcome: Literal['Accepted', 'Rejected', 'Further information requested']
    reason: str = Field(min_length=1, max_length=2000)
