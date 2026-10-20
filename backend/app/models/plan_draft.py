"""Unpublished configuration snapshots, isolated from live plans/enrolments."""
from datetime import datetime
from sqlalchemy import ForeignKey, String, Text, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PlanDraft(Base):
    __tablename__ = 'plan_drafts'
    id: Mapped[int] = mapped_column(primary_key=True)
    latest_version: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now())


class PlanDraftVersion(Base):
    __tablename__ = 'plan_draft_versions'
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey('plan_drafts.id',ondelete='RESTRICT'),index=True)
    version: Mapped[int]
    request_key: Mapped[str] = mapped_column(String(36),unique=True)
    snapshot: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=func.now())
    __table_args__ = (UniqueConstraint('draft_id','version',name='uq_plan_draft_version'),)
