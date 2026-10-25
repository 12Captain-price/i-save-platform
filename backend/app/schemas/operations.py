from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class PolicyTerms(Strict):
    evidence_days: int | None = Field(None, ge=1, le=36500, strict=True)
    identity_days: int | None = Field(None, ge=1, le=36500, strict=True)
    backup_interval_hours: int | None = Field(None, ge=1, le=8760, strict=True)


class PolicySave(Strict):
    request_key: UUID
    base_version: int = Field(ge=0, strict=True)
    terms: PolicyTerms


class Publication(Strict):
    request_key: UUID
    version: int = Field(gt=0, strict=True)
    confirm: Literal[True]
    effective_at: datetime | None = None
    @model_validator(mode='after')
    def zoned(self):
        if self.effective_at and self.effective_at.utcoffset() is None:
            raise ValueError('Effective date must include a timezone')
        return self


class Hold(Strict):
    request_key: UUID
    application_id: int = Field(gt=0, strict=True)
    base_event: int = Field(ge=0, strict=True)
    enabled: bool = Field(strict=True)
    reason: str = Field(min_length=5, max_length=1000)


class Erase(Strict):
    request_key: UUID
    preview_digest: str = Field(pattern=r'^[0-9a-f]{64}$')
    confirm: Literal[True]
    reason: str = Field(min_length=5, max_length=1000)


class Job(Strict):
    request_key: UUID
    kind: Literal['backup','restore-test']
    backup_id: int | None = Field(None, gt=0, strict=True)
    confirm: Literal[True]
    @model_validator(mode='after')
    def linked(self):
        if (self.kind=='restore-test') != (self.backup_id is not None):
            raise ValueError('Restore tests must select a completed backup')
        return self
