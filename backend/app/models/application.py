"""Membership application model: submitted, reviewed and decided by staff."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin


class MembershipApplication(Base, TimestampMixin):
    __tablename__ = "membership_applications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    application_number: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, default="Submitted"
    )
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    member: Mapped["Member | None"] = relationship(back_populates="applications")
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<MembershipApplication {self.application_number!r}>"
