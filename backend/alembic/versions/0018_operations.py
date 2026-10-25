"""Additive private-document operations; no retention publication or deletion."""
from alembic import op
import sqlalchemy as sa
revision='0018_operations'
down_revision='0017_campaigns'
branch_labels=depends_on=None
CODES=['operations:read','retention:draft','retention:publish','retention:hold','retention:execute','backups:run','backups:restore-test']
TABLES=['operations_policies','operations_events','backup_jobs']


def upgrade():
    op.create_table('operations_policies',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('base_version',sa.Integer(),nullable=False),sa.Column('snapshot',sa.Text(),nullable=False),sa.Column('request_key',sa.String(36),nullable=False,unique=True),sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),sa.Column('actor_email',sa.String(255),nullable=False),sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('operations_events',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('action',sa.String(40),nullable=False),sa.Column('target',sa.String(60),nullable=False),sa.Column('snapshot',sa.Text(),nullable=False),sa.Column('request_key',sa.String(80),nullable=False,unique=True),sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT')),sa.Column('actor_email',sa.String(255)),sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('backup_jobs',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('kind',sa.String(20),nullable=False),sa.Column('backup_id',sa.Integer(),sa.ForeignKey('backup_jobs.id',ondelete='RESTRICT')),sa.Column('request_key',sa.String(80),nullable=False,unique=True),sa.Column('state',sa.String(30),nullable=False),sa.Column('reason',sa.String(200),nullable=False),sa.Column('checksum',sa.String(64)),sa.Column('size',sa.Integer()),sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT')),sa.Column('actor_email',sa.String(255)),sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),sa.Column('finished_at',sa.DateTime(timezone=True)))
    bind=op.get_bind()
    if bind.dialect.name=='postgresql':op.execute("CREATE FUNCTION operations_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Operational history is immutable'; END $$")
    for name in TABLES[:2]:
        if bind.dialect.name=='postgresql':
            op.execute(f"CREATE TRIGGER {name}_immutable BEFORE UPDATE OR DELETE ON {name} FOR EACH ROW EXECUTE FUNCTION operations_history_immutable()")
        else:
            for action in ['UPDATE','DELETE']:op.execute(f"CREATE TRIGGER {name}_no_{action.lower()} BEFORE {action} ON {name} BEGIN SELECT RAISE(ABORT, 'Immutable operational history'); END")
    for code in CODES:
        bind.execute(sa.text('INSERT INTO permissions(code,description) VALUES (:code,:description)'),{'code':code,'description':code.replace(':',' ').replace('-',' ')})
        bind.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code=:code"),{'code':code})


def downgrade():
    bind=op.get_bind()
    if any(bind.execute(sa.text('SELECT count(*) FROM '+t)).scalar() for t in TABLES):raise RuntimeError('Operational policy/audit/backup history must be retained')
    # Older immutable history also prevents downgrade; fail before any DDL.
    retained=['marketing_preferences','marketing_consent_events','campaigns','campaign_versions','campaign_events','campaign_recipients','campaign_delivery_events','campaign_unsubscribe_links']+['account_links','notifications','recovery_requests','application_submissions','savings_interests','membership_approvals','application_registration_payments','password_setup_invitations','plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots','fee_obligations','subscription_fee_payments','fee_rate_publications','registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events','savings_contributions','savings_events','savings_ledger_entries','withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits','content_versions','content_events','public_media','support_tickets','ticket_events','ticket_messages']
    for t in retained:
        if bind.execute(sa.text('SELECT count(*) FROM '+t)).scalar():
            label='Submission provenance' if t=='application_submissions' else t+' history'
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for t in ['business_settings_versions','fee_rate_versions']:
        if bind.execute(sa.text('SELECT count(*) FROM '+t+' WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError('Settings history is retained; use reviewed recovery')
    if bind.execute(sa.text('SELECT count(*) FROM user_permissions')).scalar():raise RuntimeError('Permission history must be retained')
    basic={'staff':{'members:read','applications:read','plans:read'},'finance':{'members:read','contributions:read','fees:read','subscriptions:read','verifications:read','plans:read'}}
    for role,code in bind.execute(sa.text('SELECT r.name,p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id')):
        if not ((role=='administrator' and not code.endswith(':own')) or (role=='member' and code.endswith(':own')) or code in basic.get(role,set())):raise RuntimeError('Delegated permission history is retained')
    for code in CODES:
        if bind.execute(sa.text('SELECT count(*) FROM user_permissions u JOIN permissions p ON p.id=u.permission_id WHERE p.code=:c'),{'c':code}).scalar():raise RuntimeError('Retain permission history')
    for code in CODES:
        bind.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=:c)'),{'c':code})
        bind.execute(sa.text('DELETE FROM permissions WHERE code=:c'),{'c':code})
    for t in reversed(TABLES):op.drop_table(t)
    if bind.dialect.name=='postgresql':op.execute('DROP FUNCTION operations_history_immutable()')
