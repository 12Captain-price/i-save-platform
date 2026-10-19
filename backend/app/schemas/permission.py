"""Permission request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import TimestampSchema

Code = Annotated[str, StringConstraints(min_length=1, max_length=100)]
Description = Annotated[Optional[str], Field(max_length=255)]


class PermissionBase(BaseModel):
    code: Code
    description: Description = None


class PermissionCreate(PermissionBase):
    pass


class PermissionRead(PermissionBase, TimestampSchema):
    id: int

    model_config = ConfigDict(from_attributes=True)
