"""Plain-text only, bounded requests; no HTML, caller actors or attachments."""
import re
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel,ConfigDict,Field,StrictBool,field_validator

Kind=Literal['organisation','faq','team','event','announcement']

def plain(value):
    if value is None:return value
    if re.search(r'[<>]|(?:javascript|vbscript|data|file)\s*:|#token=',value,re.I) or any(ord(c)<32 and c not in '\n\t' for c in value):
        raise ValueError('Use plain text without HTML, scripts, private links or unsafe URLs')
    return value.strip()


class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')


class ContentFields(Strict):
    title:str=Field('',max_length=200)
    body:str=Field('',max_length=12000)
    team_role:str=Field('',max_length=150)
    location:str=Field('',max_length=300)
    event_status:Literal['','Scheduled','Cancelled','Completed']=''
    starts_at:datetime|None=None
    ends_at:datetime|None=None
    media_id:int|None=Field(None,gt=0)
    _plain=field_validator('title','body','team_role','location')(plain)
    @field_validator('starts_at','ends_at')
    @classmethod
    def offset_required(cls,v):
        if v and (v.tzinfo is None or v.utcoffset() is None):raise ValueError('Supply an explicit timezone; the office uses Africa/Harare')
        return v


class SaveContent(Strict):
    item_id:int|None=Field(None,gt=0)
    base_version:int=Field(0,ge=0)
    kind:Kind
    fields:ContentFields
    request_key:UUID


class ContentDecision(Strict):
    action:Literal['submit','request_changes','approve','publish','archive']
    base_event:int=Field(0,ge=0)
    reason:str=Field(min_length=1,max_length=1000)
    effective_at:datetime|None=None
    request_key:UUID
    _reason=field_validator('reason')(plain)
    _offset=field_validator('effective_at')(ContentFields.offset_required.__func__)


class MediaUpload(Strict):
    filename:str=Field(min_length=1,max_length=120)
    content_type:Literal['image/png','image/jpeg']
    data:str=Field(min_length=1,max_length=2796204,repr=False)
    alt:str=Field(min_length=1,max_length=300)
    rights_confirmed:StrictBool
    rights_note:str=Field(min_length=1,max_length=500)
    request_key:UUID
    _text=field_validator('alt','rights_note')(plain)


class CreateTicket(Strict):
    category:Literal['Account','Membership','Savings','Fees','Technical','Other']
    subject:str=Field(min_length=1,max_length=200)
    message:str=Field(min_length=1,max_length=6000,repr=False)
    request_key:UUID
    _text=field_validator('subject','message')(plain)


class TicketAction(Strict):
    action:Literal['reply','internal_note','assign','status','reopen']
    base_revision:int=Field(ge=0)
    message:str=Field('',max_length=6000,repr=False)
    reason:str=Field('',max_length=1000)
    status:Literal['Open','In progress','Waiting for member','Resolved']|None=None
    assignee_id:int|None=Field(None,gt=0)
    request_key:UUID
    _text=field_validator('message','reason')(plain)
