"""Shared schema types and helpers used across the API."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

Money = Annotated[Decimal, Field(decimal_places=2, ge=0, le=99999999.99)]
"""Decimal-safe monetary amount (two decimal places, non-negative)."""

Email = Annotated[str, StringConstraints(max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
"""Simple email address validated by pattern (avoids the email-validator dependency)."""

OptionalEmail = Annotated[Optional[str], StringConstraints(max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
"""Optional email address validated by pattern when present (allows NULL)."""

ID = Annotated[int, Field(gt=0)]


class TimestampSchema(BaseModel):
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    skip: int
    limit: int
