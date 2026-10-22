"""Add private evidence and explicit plan publication/enrolment; no historical backfill."""
from alembic import op
import sqlalchemy as sa

revision = '0011_documents_enrolment'
down_revision = '0010_fee_currency'
branch_labels = depends_on = None

TABLES = ['registration_evidence_profiles', 'application_evidence', 'evidence_reviews', 'plan_approvals', 'plan_publications', 'plan_applications', 'plan_enrolments', 'plan_application_events']
PERMISSIONS = ['documents:view', 'documents:review', 'documents:replace', 'plans:approve', 'plans:publish', 'plan-applications:review', 'enrolments:activate', 'plans:own']


def fk(name, table, **kw):
    return sa.Column(name, sa.Integer(), sa.ForeignKey(table, ondelete='RESTRICT'), **kw)


def actor(nullable=False):
    return [fk('actor_id', 'users.id', nullable=nullable), sa.Column('actor_email', sa.String(255), nullable=nullable)]


def timestamp():
    return sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def key(nullable=False):
    return sa.Column('request_key', sa.String(36), unique=True, nullable=nullable)


def upgrade():
    op.create_table('registration_evidence_profiles', fk('application_id', 'membership_applications.id', primary_key=True),
        sa.Column('national_id', sa.String(100)), sa.Column('income_source', sa.String(30)), sa.Column('requirements_snapshot', sa.Text(), nullable=False),
        sa.Column('consent_text', sa.Text()), sa.Column('consent_version', sa.String(80)), sa.Column('consent_at', sa.DateTime(timezone=True)))
    op.create_table('application_evidence', sa.Column('id', sa.Integer(), primary_key=True), fk('application_id', 'membership_applications.id', nullable=False),
        sa.Column('kind', sa.String(30), nullable=False), sa.Column('content', sa.LargeBinary(), nullable=False),
        sa.Column('content_type', sa.String(50), nullable=False), sa.Column('sha256', sa.String(64), nullable=False), sa.Column('scan_engine', sa.String(100), nullable=False),
        fk('replaces_id', 'application_evidence.id', unique=True, nullable=True), *actor(True), key(True), timestamp())
    op.create_index('ix_application_evidence_application_id', 'application_evidence', ['application_id'])
    op.create_table('evidence_reviews', sa.Column('id', sa.Integer(), primary_key=True), fk('evidence_id', 'application_evidence.id', nullable=False),
        sa.Column('outcome', sa.String(30), nullable=False), sa.Column('reason', sa.String(2000), nullable=False), *actor(), key(), timestamp())
    op.create_index('ix_evidence_reviews_evidence_id', 'evidence_reviews', ['evidence_id'])
    op.create_table('plan_approvals', fk('version_id', 'plan_draft_versions.id', primary_key=True), *actor(), key(), timestamp())
    op.create_table('plan_publications', fk('version_id', 'plan_approvals.version_id', primary_key=True),
        sa.Column('effective_at', sa.DateTime(timezone=True), nullable=False), *actor(), key(), sa.Column('request_snapshot', sa.Text(), nullable=False), timestamp())
    op.create_table('plan_applications', sa.Column('id', sa.Integer(), primary_key=True), fk('member_id', 'members.id', nullable=False),
        fk('draft_id', 'plan_drafts.id', nullable=False), fk('version_id', 'plan_draft_versions.id', nullable=False),
        sa.Column('terms_snapshot', sa.Text(), nullable=False), sa.Column('weekly_target', sa.Numeric(12, 2), nullable=False),
        sa.Column('currency', sa.String(10), nullable=False), sa.Column('acknowledgement_text', sa.Text(), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=False), fk('actor_id', 'users.id', nullable=False),
        sa.Column('status', sa.String(30), nullable=False), key(), sa.UniqueConstraint('member_id', 'draft_id', name='uq_member_plan_application'))
    op.create_index('ix_plan_applications_member_id', 'plan_applications', ['member_id'])
    op.create_table('plan_enrolments', fk('application_id', 'plan_applications.id', primary_key=True),
        sa.Column('activated_at', sa.DateTime(timezone=True), nullable=False), sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False), *actor())
    op.create_table('plan_application_events', sa.Column('id', sa.Integer(), primary_key=True), fk('application_id', 'plan_applications.id', nullable=False),
        sa.Column('status', sa.String(30), nullable=False), sa.Column('reason', sa.String(2000), nullable=False), *actor(), timestamp())
    op.create_index('ix_plan_application_events_application_id', 'plan_application_events', ['application_id'])
    c = op.get_bind()
    for code in PERMISSIONS:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'), {'code': code})
        # Member-owned plan access is a separate canonical Member grant. Staff receive no new authority.
        role = 'member' if code == 'plans:own' else 'administrator'
        c.execute(sa.text('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name=:role AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)'), {'code': code, 'role': role})


def downgrade():
    c = op.get_bind()
    # Refuse before any DDL, including SQLite's nontransactional DDL. A multi-step
    # downgrade must not drop this revision then fail on retained older history.
    for name,label in [('application_submissions','Submission provenance'),('savings_interests','Savings interests'),
        ('plan_draft_versions','plan_draft_versions history'),('application_settings_snapshots','application_settings_snapshots history'),
        ('subscription_settings_snapshots','subscription_settings_snapshots history'),('membership_approvals','membership_approvals history'),
        ('application_registration_payments','application_registration_payments history'),('password_setup_invitations','password_setup_invitations history'),
        ('fee_obligations','fee_obligations history'),('subscription_fee_payments','subscription_fee_payments history'),('fee_rate_publications','fee_rate_publications history')]:
        if c.execute(sa.text('SELECT count(*) FROM '+name)).scalar():raise RuntimeError(label+' is retained; use reviewed recovery.')
    for name in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+name+' WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(name+' history is retained; use reviewed recovery.')
    for name in TABLES:
        if c.execute(sa.text('SELECT count(*) FROM '+name)).scalar():
            raise RuntimeError('Document/plan history is retained; use reviewed recovery.')
    for name in reversed(TABLES):
        op.drop_table(name)
