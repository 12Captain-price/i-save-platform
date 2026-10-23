"""Withdrawal reservations, immutable evidence/events and linked payout debits."""
from datetime import date,datetime
from decimal import Decimal
from sqlalchemy import ForeignKey,String,Text,Numeric,Date,DateTime,CheckConstraint,func
from sqlalchemy.orm import Mapped,mapped_column
from app.database import Base


class WithdrawalRequest(Base):
    __tablename__='withdrawal_requests'
    id:Mapped[int]=mapped_column(primary_key=True)
    enrolment_id:Mapped[int]=mapped_column(ForeignKey('plan_enrolments.application_id',ondelete='RESTRICT'),index=True)
    member_id:Mapped[int]=mapped_column(ForeignKey('members.id',ondelete='RESTRICT'),index=True)
    amount:Mapped[Decimal]=mapped_column(Numeric(12,2))
    currency:Mapped[str]=mapped_column(String(10))
    status:Mapped[str]=mapped_column(String(30))
    terms_snapshot:Mapped[str]=mapped_column(Text)
    policy_snapshot:Mapped[str]=mapped_column(Text)
    settings_version:Mapped[int|None]=mapped_column(ForeignKey('business_settings_versions.id',ondelete='RESTRICT'))
    completion_date:Mapped[date]=mapped_column(Date)
    requested_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    notice_ends_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    __table_args__=(CheckConstraint('amount>0',name='ck_withdrawal_positive'),)


class WithdrawalEvent(Base):
    __tablename__='withdrawal_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    withdrawal_id:Mapped[int]=mapped_column(ForeignKey('withdrawal_requests.id',ondelete='RESTRICT'),index=True)
    action:Mapped[str]=mapped_column(String(40))
    outcome:Mapped[str]=mapped_column(String(30))
    reason:Mapped[str]=mapped_column(String(2000))
    evidence_reference:Mapped[str]=mapped_column(String(200))
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class WithdrawalPayout(Base):
    __tablename__='withdrawal_payouts'
    withdrawal_id:Mapped[int]=mapped_column(ForeignKey('withdrawal_requests.id',ondelete='RESTRICT'),primary_key=True)
    amount:Mapped[Decimal]=mapped_column(Numeric(12,2))
    currency:Mapped[str]=mapped_column(String(10))
    method:Mapped[str]=mapped_column(String(30))
    payment_date:Mapped[date]=mapped_column(Date)
    payment_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    reference:Mapped[str]=mapped_column(String(100))
    reference_key:Mapped[str]=mapped_column(String(64),unique=True)
    recorded_by:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    verified_by:Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    verified_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))


class WithdrawalDebit(Base):
    __tablename__='withdrawal_debits'
    id:Mapped[int]=mapped_column(primary_key=True)
    withdrawal_id:Mapped[int]=mapped_column(ForeignKey('withdrawal_payouts.withdrawal_id',ondelete='RESTRICT'),unique=True)
    enrolment_id:Mapped[int]=mapped_column(ForeignKey('plan_enrolments.application_id',ondelete='RESTRICT'),index=True)
    member_id:Mapped[int]=mapped_column(ForeignKey('members.id',ondelete='RESTRICT'),index=True)
    amount:Mapped[Decimal]=mapped_column(Numeric(12,2))
    currency:Mapped[str]=mapped_column(String(10))
    event_id:Mapped[int]=mapped_column(ForeignKey('withdrawal_events.id',ondelete='RESTRICT'),unique=True)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(CheckConstraint('amount<0',name='ck_withdrawal_debit_negative'),)
