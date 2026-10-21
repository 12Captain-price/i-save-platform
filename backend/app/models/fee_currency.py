"""Immutable fee quotes and rate history; never a savings exchange ledger."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class FeeRateVersion(Base):
    __tablename__='fee_rate_versions'
    id: Mapped[int]=mapped_column(primary_key=True)
    base_version: Mapped[int]
    request_key: Mapped[str]=mapped_column(String(36),unique=True)
    rate: Mapped[Decimal]=mapped_column(Numeric(18,8))
    source: Mapped[str]=mapped_column(String(500))
    actor_id: Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email: Mapped[str|None]=mapped_column(String(255))
    recorded_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class FeeRatePublication(Base):
    __tablename__='fee_rate_publications'
    id: Mapped[int]=mapped_column(primary_key=True)
    version_id: Mapped[int]=mapped_column(ForeignKey('fee_rate_versions.id',ondelete='RESTRICT'),unique=True)
    request_key: Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot: Mapped[str]=mapped_column(Text)
    effective_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    actor_id: Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email: Mapped[str]=mapped_column(String(255))
    recorded_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class FeeObligation(Base):
    __tablename__='fee_obligations'
    id: Mapped[int]=mapped_column(primary_key=True)
    application_id: Mapped[int|None]=mapped_column(ForeignKey('membership_applications.id',ondelete='RESTRICT'),unique=True)
    subscription_id: Mapped[int|None]=mapped_column(ForeignKey('subscriptions.id',ondelete='RESTRICT'),unique=True)
    amount: Mapped[Decimal]=mapped_column(Numeric(12,2))
    currency: Mapped[str]=mapped_column(String(10))
    rate_version_id: Mapped[int|None]=mapped_column(ForeignKey('fee_rate_versions.id',ondelete='RESTRICT'))
    rate_per_usd: Mapped[Decimal|None]=mapped_column(Numeric(18,8))
    zig_amount: Mapped[Decimal|None]=mapped_column(Numeric(12,2))
    rounding: Mapped[str]=mapped_column(String(40))
    origin: Mapped[str]=mapped_column(String(80))
    created_by: Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(CheckConstraint('(application_id IS NOT NULL AND subscription_id IS NULL) OR (application_id IS NULL AND subscription_id IS NOT NULL)',name='ck_fee_obligation_target'),)


class SubscriptionFeePayment(Base):
    __tablename__='subscription_fee_payments'
    subscription_id: Mapped[int]=mapped_column(ForeignKey('subscriptions.id',ondelete='RESTRICT'),primary_key=True)
    reference: Mapped[str]=mapped_column(String(80))
    reference_key: Mapped[str]=mapped_column(String(80),unique=True)
    amount: Mapped[Decimal]=mapped_column(Numeric(12,2))
    currency: Mapped[str]=mapped_column(String(10))
    payment_date: Mapped[date]=mapped_column(Date)
    recorded_by: Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    recorder_email: Mapped[str]=mapped_column(String(255))
    recorded_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    verified_by: Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    verifier_email: Mapped[str|None]=mapped_column(String(255))
    verified_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
