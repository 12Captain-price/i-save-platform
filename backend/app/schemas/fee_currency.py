from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from app.schemas.business_settings import SettingsPublish


class RateSave(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_key: UUID
    base_version: int=Field(ge=0,strict=True)
    rate: Decimal=Field(gt=0,max_digits=18,decimal_places=8)
    source: str=Field(min_length=1,max_length=500)


RatePublish=SettingsPublish
