"""Add account-link history and recipient-owned event outbox without changing accounts/grants."""
from alembic import op
import sqlalchemy as sa
revision = '0015_account_workflows'
down_revision = '0014_withdrawals'
branch_labels = depends_on = None


def upgrade():
    op.create_table('recovery_requests',sa.Column('request_key',sa.String(36),primary_key=True),
        sa.Column('email_hash',sa.String(64),nullable=False),sa.Column('state',sa.String(20),nullable=False),
        sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('account_links',
        sa.Column('token_hash',sa.String(64),primary_key=True),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False,index=True),
        sa.Column('purpose',sa.String(20),nullable=False),sa.Column('request_key',sa.String(36),nullable=False,unique=True),
        sa.Column('issued_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT')),
        sa.Column('issued_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('consumed_at',sa.DateTime(timezone=True)),sa.Column('revoked_at',sa.DateTime(timezone=True)),
        sa.Column('delivery_state',sa.String(30),nullable=False))
    op.create_table('notifications',sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False,index=True),
        sa.Column('event_key',sa.String(150),nullable=False,unique=True),sa.Column('message',sa.String(500),nullable=False),
        sa.Column('screen',sa.String(30),nullable=False),sa.Column('read',sa.Boolean(),nullable=False),
        sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('delivery_state',sa.String(30),nullable=False),sa.Column('delivery_attempts',sa.Integer(),nullable=False))


def downgrade():
    c=op.get_bind()
    # SQLite DDL cannot roll back a later revision's refusal. Preflight all
    # retained history before removing even the empty new tables.
    retained=['application_submissions','savings_interests','membership_approvals','application_registration_payments','password_setup_invitations','plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots','fee_obligations','subscription_fee_payments','fee_rate_publications','registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events','savings_contributions','savings_events','savings_ledger_entries','withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits']
    for table in retained:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            label='Submission provenance' if table=='application_submissions' else 'Savings interests' if table=='savings_interests' else table+' history'
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for table in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+table+' WHERE actor_id IS NOT NULL')).scalar():
            raise RuntimeError(table+' history is retained; use reviewed recovery')
    for table in ['notifications','account_links','recovery_requests']:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            raise RuntimeError('Account and notification history retained; use reviewed recovery')
    op.drop_table('notifications');op.drop_table('account_links')
    op.drop_table('recovery_requests')
