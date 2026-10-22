"""Savings workflow projections plus immutable events and signed ledger entries."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SavingsContribution(Base):
    __tablename__ = 'savings_contributions'
    id: Mapped[int] = mapped_column(primary_key=True)
    enrolment_id: Mapped[int] = mapped_column(ForeignKey('plan_enrolments.application_id', ondelete='RESTRICT'), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id', ondelete='RESTRICT'), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10))
    payment_date: Mapped[date] = mapped_column(Date)
    method: Mapped[str] = mapped_column(String(100))
    reference: Mapped[str] = mapped_column(String(100))
    reference_key: Mapped[str] = mapped_column(String(64), unique=True)
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    request_snapshot: Mapped[str] = mapped_column(Text)
    policy_snapshot: Mapped[str] = mapped_column(Text)
    flags: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40))
    recorded_by: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint('amount > 0', name='ck_savings_positive'),)


class SavingsEvent(Base):
    __tablename__ = 'savings_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    contribution_id: Mapped[int] = mapped_column(ForeignKey('savings_contributions.id', ondelete='RESTRICT'), index=True)
    action: Mapped[str] = mapped_column(String(40))
    outcome: Mapped[str] = mapped_column(String(40))
    evidence_reference: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    request_snapshot: Mapped[str] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SavingsLedgerEntry(Base):
    __tablename__ = 'savings_ledger_entries'
    id: Mapped[int] = mapped_column(primary_key=True)
    contribution_id: Mapped[int] = mapped_column(ForeignKey('savings_contributions.id', ondelete='RESTRICT'), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id', ondelete='RESTRICT'), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10))
    reverses_id: Mapped[int | None] = mapped_column(ForeignKey('savings_ledger_entries.id', ondelete='RESTRICT'), nullable=True, unique=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('savings_events.id', ondelete='RESTRICT'), unique=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('contribution_id', 'kind', name='uq_savings_posting_kind'),
        CheckConstraint("(kind = 'Credit' AND amount > 0 AND reverses_id IS NULL) OR (kind = 'Reversal' AND amount < 0 AND reverses_id IS NOT NULL)", name='ck_savings_entry_sign'))
