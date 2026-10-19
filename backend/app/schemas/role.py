"""Role request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import TimestampSchema

Name = Annotated[str, StringConstraints(min_length=1, max_length=50)]
Description = Annotated[Optional[str], Field(max_length=255)]


class RoleBase(BaseModel):
    name: Name
    description: Description = None


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: Optional[Name] = None
    description: Description = None


class RoleRead(RoleBase, TimestampSchema):
    id: int

    model_config = ConfigDict(from_attributes=True)
