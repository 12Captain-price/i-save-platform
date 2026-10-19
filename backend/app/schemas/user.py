"""User account request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from typing_extensions import Annotated

from app.schemas.common import Email

Password = Annotated[str, Field(min_length=12, max_length=72, repr=False)]


class UserBase(BaseModel):
    email: Email
    role_id: Optional[int] = Field(default=None, gt=0)
    is_active: bool = True


class UserCreate(UserBase):
    model_config = ConfigDict(extra="forbid")
    password: Password

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Optional[Email] = None
    role_id: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class UserRead(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserOut(BaseModel):
    """User representation that never exposes the password hash."""
    id: int
    email: str
    is_active: bool
    role_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
