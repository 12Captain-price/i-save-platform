"""Member request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Email, OptionalEmail

MemberNumber = Annotated[str, StringConstraints(min_length=1, max_length=50)]


class MemberBase(BaseModel):
    member_number: MemberNumber
    first_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    last_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    email: OptionalEmail = None
    phone: Annotated[Optional[str], Field(max_length=50)] = None
    address: Annotated[Optional[str], Field(max_length=255)] = None
    joined_at: Optional[datetime] = None


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    member_number: Optional[MemberNumber] = None
    first_name: Annotated[Optional[str], StringConstraints(min_length=1, max_length=100)] = None
    last_name: Annotated[Optional[str], StringConstraints(min_length=1, max_length=100)] = None
    email: OptionalEmail = None
    phone: Annotated[Optional[str], Field(max_length=50)] = None
    address: Annotated[Optional[str], Field(max_length=255)] = None
    joined_at: Optional[datetime] = None


class MemberRead(MemberBase):
    id: int
    user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
