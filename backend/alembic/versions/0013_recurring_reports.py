"""Dedicated recurring-generation and reporting permissions; no historical billing."""
from alembic import op
import sqlalchemy as sa
revision='0013_recurring_reports'
down_revision='0012_savings_ledger'
branch_labels=depends_on=None
CODES=['subscriptions:generate','reports:read','reports:export']


def upgrade():
    c=op.get_bind()
    for code in CODES:
        if not c.execute(sa.text('SELECT id FROM permissions WHERE code=:code'),{'code':code}).first():
            c.execute(sa.text('INSERT INTO permissions(code) VALUES (:code)'),{'code':code})
        c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.name='administrator' AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"),{'code':code})


def downgrade():
    c=op.get_bind()
    # Preflight downstream retention guards BEFORE changing the head/grants.
    # SQLite DDL cannot roll back an earlier revision in a multi-step downgrade.
    for table,label in [('application_submissions','Submission provenance'),('savings_interests','Savings interests'),
        ('application_settings_snapshots','Application settings history'),('subscription_settings_snapshots','Subscription settings history'),
        ('membership_approvals','Membership approval history'),('application_registration_payments','Registration payment history'),
        ('password_setup_invitations','Invitation history'),('fee_obligations','Fee obligation history'),
        ('subscription_fee_payments','Subscription payment history'),('fee_rate_publications','Rate publication history'),
        ('plan_draft_versions','Plan draft history'),('registration_evidence_profiles','Evidence history'),
        ('application_evidence','Evidence history'),('evidence_reviews','Evidence review history'),
        ('plan_approvals','Plan approval history'),('plan_publications','Plan publication history'),
        ('plan_applications','Plan application history'),('plan_enrolments','Enrolment history'),
        ('plan_application_events','Plan history'),('savings_contributions','Financial history'),
        ('savings_events','Financial history'),('savings_ledger_entries','Financial history')]:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for table in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+table+' WHERE actor_id IS NOT NULL')).scalar():
            raise RuntimeError(table+' history is retained; use reviewed recovery')
    if c.execute(sa.text("SELECT count(*) FROM audit_events WHERE event_type IN ('subscription_generation','financial_report')")).scalar():
        raise RuntimeError('Recurring/report history is retained; use reviewed recovery')
    for code in CODES:
        if c.execute(sa.text('SELECT count(*) FROM user_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=:code)'),{'code':code}).scalar():
            raise RuntimeError('Individual permission history is retained; use reviewed recovery')
        if c.execute(sa.text("SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code AND r.name!='administrator'"),{'code':code}).scalar():
            raise RuntimeError('Delegated permission history is retained; use reviewed recovery')
    for code in CODES:
        c.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text('DELETE FROM permissions WHERE code=:code'),{'code':code})
