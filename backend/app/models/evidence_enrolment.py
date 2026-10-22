"""Private evidence and immutable published-plan/acceptance records."""
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import DateTime, Date, ForeignKey, String, Text, LargeBinary, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class RegistrationEvidenceProfile(Base):
    __tablename__ = 'registration_evidence_profiles'
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id', ondelete='RESTRICT'), primary_key=True)
    national_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    income_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    requirements_snapshot: Mapped[str] = mapped_column(Text)
    consent_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ApplicationEvidence(Base):
    __tablename__ = 'application_evidence'
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey('membership_applications.id', ondelete='RESTRICT'), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    content_type: Mapped[str] = mapped_column(String(50))
    sha256: Mapped[str] = mapped_column(String(64))
    scan_engine: Mapped[str] = mapped_column(String(100))
    replaces_id: Mapped[int | None] = mapped_column(ForeignKey('application_evidence.id', ondelete='RESTRICT'), nullable=True, unique=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_key: Mapped[str | None] = mapped_column(String(36), unique=True, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvidenceReview(Base):
    __tablename__ = 'evidence_reviews'
    id: Mapped[int] = mapped_column(primary_key=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey('application_evidence.id', ondelete='RESTRICT'), index=True)
    outcome: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str] = mapped_column(String(2000))
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlanApproval(Base):
    __tablename__ = 'plan_approvals'
    version_id: Mapped[int] = mapped_column(ForeignKey('plan_draft_versions.id', ondelete='RESTRICT'), primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlanPublication(Base):
    __tablename__ = 'plan_publications'
    version_id: Mapped[int] = mapped_column(ForeignKey('plan_approvals.version_id', ondelete='RESTRICT'), primary_key=True)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    request_snapshot: Mapped[str] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlanApplication(Base):
    __tablename__ = 'plan_applications'
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id', ondelete='RESTRICT'), index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey('plan_drafts.id', ondelete='RESTRICT'))
    version_id: Mapped[int] = mapped_column(ForeignKey('plan_draft_versions.id', ondelete='RESTRICT'))
    terms_snapshot: Mapped[str] = mapped_column(Text)
    weekly_target: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10))
    acknowledgement_text: Mapped[str] = mapped_column(Text)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    status: Mapped[str] = mapped_column(String(30), default='Pending')
    request_key: Mapped[str] = mapped_column(String(36), unique=True)
    __table_args__ = (UniqueConstraint('member_id', 'draft_id', name='uq_member_plan_application'),)


class PlanEnrolment(Base):
    __tablename__ = 'plan_enrolments'
    application_id: Mapped[int] = mapped_column(ForeignKey('plan_applications.id', ondelete='RESTRICT'), primary_key=True)
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))


class PlanApplicationEvent(Base):
    __tablename__ = 'plan_application_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey('plan_applications.id', ondelete='RESTRICT'), index=True)
    status: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str] = mapped_column(String(2000))
    actor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    actor_email: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
