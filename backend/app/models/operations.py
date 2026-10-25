"""Operational policy, immutable decisions and retry-safe backup jobs."""
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class OperationsPolicy(Base):
    __tablename__ = 'operations_policies'
    id: Mapped[int] = mapped_column(primary_key=True)
    base_version: Mapped[int] = mapped_column()
    snapshot: Mapped[str] = mapped_column(Text)
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OperationsEvent(Base):
    __tablename__ = 'operations_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(60))
    snapshot: Mapped[str] = mapped_column(Text)
    request_key: Mapped[str] = mapped_column(String(80), unique=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BackupJob(Base):
    __tablename__ = 'backup_jobs'
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    backup_id: Mapped[int | None] = mapped_column(ForeignKey('backup_jobs.id', ondelete='RESTRICT'))
    request_key: Mapped[str] = mapped_column(String(80), unique=True)
    state: Mapped[str] = mapped_column(String(30), default='Queued')
    reason: Mapped[str] = mapped_column(String(200), default='')
    checksum: Mapped[str | None] = mapped_column(String(64))
    size: Mapped[int | None] = mapped_column(Integer)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
