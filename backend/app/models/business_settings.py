from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BusinessSettingsVersion(Base):
    __tablename__ = 'business_settings_versions'
    id: Mapped[int] = mapped_column(primary_key=True)
    base_version: Mapped[int]
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    snapshot: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BusinessSettingsPublication(Base):
    __tablename__ = 'business_settings_publications'
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey('business_settings_versions.id', ondelete='RESTRICT'), unique=True)
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    request_snapshot: Mapped[str] = mapped_column(Text)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApplicationSettingsSnapshot(Base):
    __tablename__ = 'application_settings_snapshots'
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id', ondelete='RESTRICT'), primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey('business_settings_versions.id', ondelete='RESTRICT'))


class SubscriptionSettingsSnapshot(Base):
    __tablename__ = 'subscription_settings_snapshots'
    subscription_id: Mapped[int] = mapped_column(ForeignKey('subscriptions.id', ondelete='RESTRICT'), primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey('business_settings_versions.id', ondelete='RESTRICT'))
