from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field,StrictBool,field_validator
from app.schemas.content_support import Strict,plain,ContentFields

CONSENT_VERSION='campaign-consent-v1'
CONSENT_WORDING='I agree to receive optional i-Save announcement and event emails. I can unsubscribe at any time. Essential account and security messages are separate.'
UNSUBSCRIBE_VERSION='campaign-unsubscribe-v1'
UNSUBSCRIBE_WORDING='Stop optional announcement and event emails.'
class Preference(Strict):
    enabled:StrictBool
    version:str
    base_revision:int=Field(ge=0)
    request_key:UUID
class Unsubscribe(Strict):
    token:str=Field(min_length=1,max_length=128,repr=False)
    confirm:StrictBool
class CampaignFields(Strict):
    subject:str=Field('',max_length=200)
    message:str=Field('',max_length=4000)
    audience:Literal['active_opted_in_members']='active_opted_in_members'
    scheduled_at:datetime|None=None
    _plain=field_validator('subject','message')(plain)
    _offset=field_validator('scheduled_at')(ContentFields.offset_required.__func__)
    @field_validator('subject')
    @classmethod
    def single_line(cls,v):
        if '\n' in v or '\r' in v:raise ValueError('Subject must be a single line')
        return v
class SaveCampaign(Strict):
    campaign_id:int|None=Field(None,gt=0)
    base_version:int=Field(0,ge=0)
    content_version_id:int=Field(gt=0)
    fields:CampaignFields
    request_key:UUID
class CampaignDecision(Strict):
    action:Literal['approve','queue','cancel']
    base_event:int=Field(ge=0)
    reason:str=Field(min_length=1,max_length=1000)
    confirm:StrictBool=False
    preview_digest:str=Field('',max_length=64)
    request_key:UUID
    _plain=field_validator('reason')(plain)
class CampaignRetry(Strict):
    reason:str=Field(min_length=1,max_length=1000)
    confirm:StrictBool
    request_key:UUID
    _plain=field_validator('reason')(plain)
