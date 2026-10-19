"""User account request/response schemas."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

from app.schemas.common import Email

Password = Annotated[str, Field(min_length=8, max_length=128)]


class UserBase(BaseModel):
    email: Email
    role_id: Optional[int] = Field(default=None, gt=0)
    is_active: bool = True


class UserCreate(UserBase):
    password: Password


class UserUpdate(BaseModel):
    email: Optional[Email] = None
    role_id: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class UserRead(UserBase):
    id: int
    password_hash: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserOut(BaseModel):
    """User representation that never exposes the password hash."""
    id: int
    email: str
    is_active: bool
    role_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
