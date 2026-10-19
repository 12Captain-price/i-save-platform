"""Member savings-plan enrolment (many-to-member, many-to-plan)."""
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin


class MemberPlan(Base, TimestampMixin):
    __tablename__ = "member_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("savings_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    member: Mapped["Member"] = relationship(back_populates="plans")
    plan: Mapped["SavingsPlan"] = relationship(back_populates="enrolments")

    __table_args__ = (
        UniqueConstraint("member_id", "plan_id", name="uq_member_plan"),
    )
