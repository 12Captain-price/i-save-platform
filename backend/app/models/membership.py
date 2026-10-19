"""Application-linked registration payments; never savings or duplicate postings."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ApplicationRegistrationPayment(Base):
    __tablename__ = 'application_registration_payments'
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id',ondelete='RESTRICT'),primary_key=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey('members.id',ondelete='RESTRICT'),nullable=True,index=True)
    reference: Mapped[str] = mapped_column(String(80))
    reference_key: Mapped[str] = mapped_column(String(80),unique=True,index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12,2))
    currency: Mapped[str] = mapped_column(String(10))
    payment_date: Mapped[date] = mapped_column(Date)
    recorded_by: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    recorder_email: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now())
    verified_by: Mapped[int | None] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),nullable=True)
    verifier_email: Mapped[str | None] = mapped_column(String(255),nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)


class MembershipApproval(Base):
    __tablename__ = 'membership_approvals'
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id',ondelete='RESTRICT'),primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id',ondelete='RESTRICT'),unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),unique=True)
    approved_by: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    approver_email: Mapped[str] = mapped_column(String(255))
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledgement_version: Mapped[str] = mapped_column(String(80))
    acknowledgement_text: Mapped[str] = mapped_column(Text)
    activated_by: Mapped[int | None] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),nullable=True)
    activator_email: Mapped[str | None] = mapped_column(String(255),nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)
    subscription_start_month: Mapped[str | None] = mapped_column(String(7),nullable=True)


class PasswordSetupInvitation(Base):
    __tablename__ = 'password_setup_invitations'
    token_hash: Mapped[str] = mapped_column(String(64),primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id',ondelete='RESTRICT'),index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),index=True)
    request_key: Mapped[str] = mapped_column(String(36),unique=True)
    issued_by: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255),nullable=True)
    delivery_state: Mapped[str] = mapped_column(String(30))
