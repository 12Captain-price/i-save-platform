"""Payment verification / reconciliation record linking a verified payment."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin


class PaymentVerification(Base, TimestampMixin):
    __tablename__ = "payment_verifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    verification_reference: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    contribution_id: Mapped[int | None] = mapped_column(
        ForeignKey("contributions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    registration_fee_id: Mapped[int | None] = mapped_column(
        ForeignKey("registration_fees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verified_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, default="Verified"
    )
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    verifier: Mapped["User | None"] = relationship(foreign_keys=[verified_by])

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<PaymentVerification {self.verification_reference!r}>"
