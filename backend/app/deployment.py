"""Read-only guard against promoting known disposable fixtures to production.

Staging explicitly allows synthetic data; transport/configuration hardening is
still production-shaped there. This is not a substitute for release inventory.
"""
from sqlalchemy import select,func,or_
from app.config import get_settings
from app.models.user import User
from app.models.audit_event import AuditEvent
from app.models.application import MembershipApplication
from app.models.member import Member
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.plan_draft import PlanDraftVersion
from app.models.evidence_enrolment import PlanPublication
from app.models.fee_currency import FeeRateVersion,FeeRatePublication


def check_deployment_data(connection, settings=None):
    settings=settings or get_settings()
    if settings.app_env!='production' or settings.deployment_tier!='production':return
    try:
        fixture_account=connection.execute(select(User.id).where(func.lower(User.email).like('%@example.test')).limit(1)).first()
        fixture_audit=connection.execute(select(AuditEvent.id).where(AuditEvent.event_type.in_(['test_fixture','synthetic_fixture'])).limit(1)).first()
        fixture_application=connection.execute(select(MembershipApplication.id).where(func.lower(MembershipApplication.email).like('%@example.test')).limit(1)).first()
        fixture_member=connection.execute(select(Member.id).where(or_(func.lower(Member.email).like('%@example.test'),func.upper(Member.member_number).like('SYNTHETIC-%'))).limit(1)).first()
        fixture_policy=False
        for version,publication,column in [(BusinessSettingsVersion,BusinessSettingsPublication,BusinessSettingsVersion.snapshot),
                (PlanDraftVersion,PlanPublication,PlanDraftVersion.snapshot),(FeeRateVersion,FeeRatePublication,FeeRateVersion.source)]:
            marked=or_(*(func.lower(column).contains(marker) for marker in ('test only','test-only','disposable rehearsal')))
            fixture_policy |= bool(connection.execute(select(version.id).join(publication,publication.version_id==version.id).where(marked).limit(1)).first())
    except Exception:
        raise RuntimeError('Production data inventory check unavailable; refusing startup') from None
    if fixture_account or fixture_audit or fixture_application or fixture_member or fixture_policy:
        raise RuntimeError('Known disposable fixture data detected; production startup refused. Review privately; no records were changed.')


def validate_deployment_data(engine):
    settings=get_settings()
    if settings.app_env=='production' and settings.deployment_tier=='production':
        with engine.connect() as connection:check_deployment_data(connection,settings)
