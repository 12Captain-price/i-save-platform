"""Versioned business configuration. No credentials or feature-enable switches."""
import json
from pathlib import Path
from sqlalchemy import select
from app.models.business_settings import BusinessSettingsVersion as Version, BusinessSettingsPublication as Publication, ApplicationSettingsSnapshot
from app.security.auth import now

DEFAULTS = json.loads(Path(__file__).resolve().parents[1].joinpath('business_defaults.json').read_text(encoding='utf-8'))


def active(db, at=None):
    row = db.execute(select(Version).join(Publication, Publication.version_id==Version.id).where(
        Publication.effective_at <= (at or now())).order_by(Publication.effective_at.desc(), Publication.id.desc())).scalars().first()
    # Unit-test create_all and legacy snapshots use the exact frozen baseline.
    return (row.id, json.loads(row.snapshot)) if row else (0, dict(DEFAULTS))


def application_policy(db, application_id):
    from app.models.membership import ApplicationRegistrationPayment
    binding = db.get(ApplicationSettingsSnapshot, application_id)
    if binding:
        row = db.get(Version, binding.version_id)
        return row.id, json.loads(row.snapshot)
    from app.models.fee_currency import FeeObligation
    if db.get(ApplicationRegistrationPayment, application_id) or db.query(FeeObligation).filter_by(application_id=application_id).first():
        return 0, dict(DEFAULTS)  # Existing payment retains the original gate/wording.
    return active(db)


def acknowledgement(terms, version):
    from app.membership_policy import POLICY
    text = terms['review_acknowledgement']
    return {'acknowledgement':text, 'acknowledgement_version':POLICY['acknowledgement_version'] if text==DEFAULTS['review_acknowledgement'] else f'organisation-review-{version}'}


def public_contacts(db):
    version, terms = active(db)
    return {'version':version, **{k:terms[k] for k in ['office','email','office_phone','director_phone','additional_phone']}}
