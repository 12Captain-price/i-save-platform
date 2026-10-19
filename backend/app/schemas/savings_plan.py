"""Savings plan request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import TimestampSchema

Name = Annotated[str, StringConstraints(min_length=1, max_length=100)]
Description = Annotated[Optional[str], Field(max_length=255)]


class SavingsPlanBase(BaseModel):
    name: Name
    description: Description = None
    is_active: bool = True


class SavingsPlanCreate(SavingsPlanBase):
    pass


class SavingsPlanUpdate(BaseModel):
    name: Optional[Name] = None
    description: Description = None
    is_active: Optional[bool] = None


class SavingsPlanRead(SavingsPlanBase, TimestampSchema):
    id: int

    model_config = ConfigDict(from_attributes=True)
