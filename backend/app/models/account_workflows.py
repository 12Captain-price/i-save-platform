"""Hashed one-use access links and transactional recipient-owned notifications."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AccountLink(Base):
    __tablename__ = 'account_links'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    issued_by: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_state: Mapped[str] = mapped_column(String(30))


class Notification(Base):
    __tablename__ = 'notifications'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    event_key: Mapped[str] = mapped_column(String(150), unique=True)
    message: Mapped[str] = mapped_column(String(500))
    screen: Mapped[str] = mapped_column(String(30))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    delivery_state: Mapped[str] = mapped_column(String(30), default='Not requested')
    delivery_attempts: Mapped[int] = mapped_column(default=0)


class RecoveryRequest(Base):
    __tablename__ = 'recovery_requests'
    request_key: Mapped[str] = mapped_column(String(36),primary_key=True)
    email_hash: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(20),default='Pending')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now())
