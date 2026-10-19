"""Savings contribution: a payment into a member's savings plan.

A contribution starts as ``Pending verification`` and only becomes confirmed
savings once a verification record marks it ``Verified``. Pending contributions
are never counted as confirmed savings.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin


class Contribution(Base, TimestampMixin):
    __tablename__ = "contributions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    contribution_reference: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("savings_plans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, default="Pending verification"
    )
    recorded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    member: Mapped["Member"] = relationship(back_populates="contributions")
    plan: Mapped["SavingsPlan | None"] = relationship()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Contribution {self.contribution_reference!r}>"
