"""Registration-fee record: one-time fee paid when joining the organisation."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, TimestampMixin


class RegistrationFee(Base, TimestampMixin):
    __tablename__ = "registration_fees"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    fee_reference: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, default="Pending"
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
