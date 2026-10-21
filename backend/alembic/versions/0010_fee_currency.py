"""Unpublished management rate and immutable full-fee currency snapshots."""
from alembic import op
import sqlalchemy as sa
from decimal import Decimal
import json

revision='0010_fee_currency'
down_revision='0009_business_settings'
branch_labels=None
depends_on=None


def upgrade():
    versions=op.create_table('fee_rate_versions',
        sa.Column('id',sa.Integer(),primary_key=True),sa.Column('base_version',sa.Integer(),nullable=False),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),sa.Column('rate',sa.Numeric(18,8),nullable=False),sa.Column('source',sa.String(500),nullable=False),
        sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),sa.Column('actor_email',sa.String(255),nullable=True),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('fee_rate_publications',
        sa.Column('id',sa.Integer(),primary_key=True),sa.Column('version_id',sa.Integer(),sa.ForeignKey('fee_rate_versions.id',ondelete='RESTRICT'),nullable=False,unique=True),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False),sa.Column('effective_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),sa.Column('actor_email',sa.String(255),nullable=False),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    obligations=op.create_table('fee_obligations',
        sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='RESTRICT'),nullable=True,unique=True),
        sa.Column('subscription_id',sa.Integer(),sa.ForeignKey('subscriptions.id',ondelete='RESTRICT'),nullable=True,unique=True),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),sa.Column('currency',sa.String(10),nullable=False),
        sa.Column('rate_version_id',sa.Integer(),sa.ForeignKey('fee_rate_versions.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('rate_per_usd',sa.Numeric(18,8),nullable=True),sa.Column('zig_amount',sa.Numeric(12,2),nullable=True),
        sa.Column('rounding',sa.String(40),nullable=False),sa.Column('origin',sa.String(80),nullable=False),
        sa.Column('created_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.CheckConstraint('(application_id IS NOT NULL AND subscription_id IS NULL) OR (application_id IS NULL AND subscription_id IS NOT NULL)',name='ck_fee_obligation_target'))
    op.create_table('subscription_fee_payments',
        sa.Column('subscription_id',sa.Integer(),sa.ForeignKey('subscriptions.id',ondelete='RESTRICT'),primary_key=True),
        sa.Column('reference',sa.String(80),nullable=False),sa.Column('reference_key',sa.String(80),nullable=False,unique=True),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),sa.Column('currency',sa.String(10),nullable=False),sa.Column('payment_date',sa.Date(),nullable=False),
        sa.Column('recorded_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),sa.Column('recorder_email',sa.String(255),nullable=False),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('verified_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),sa.Column('verifier_email',sa.String(255),nullable=True),sa.Column('verified_at',sa.DateTime(timezone=True),nullable=True))
    c=op.get_bind()
    c.execute(versions.insert().values(base_version=0,request_key='00000000-0000-0000-0000-000000000034',rate=Decimal('34'),source='Management-supplied: 34 ZiG per USD. Draft awaiting explicit publication.'))
    # Preserve old obligations as they were. Never attach a newly supplied rate retroactively.
    for name,identifier,created in [('subscriptions','subscription_id','created_at'),('application_registration_payments','application_id','recorded_at')]:
        table=sa.Table(name,sa.MetaData(),autoload_with=c)
        for row in c.execute(sa.select(table)).mappings():
            amount,currency=row['amount'],row['currency']
            if identifier=='application_id':
                snapshot=c.execute(sa.text('SELECT v.snapshot FROM business_settings_versions v JOIN application_settings_snapshots s ON s.version_id=v.id WHERE s.application_id=:id'),{'id':row['application_id']}).scalar()
                terms=json.loads(snapshot) if snapshot else {'registration_amount':'20.00','registration_currency':'USD'}
                amount,currency=Decimal(terms['registration_amount']),terms['registration_currency']
            c.execute(obligations.insert().values(**{identifier:row['id'] if identifier=='subscription_id' else row['application_id']},amount=amount,currency=currency,rounding='ROUND_HALF_UP_2DP',origin='Preserved legacy obligation',created_at=row[created]))
    for code in ['subscription-fees:record','subscription-fees:verify']:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"),{'code':code})


def downgrade():
    c=op.get_bind()
    for name in ['fee_obligations','fee_rate_publications','subscription_fee_payments','plan_draft_versions','membership_approvals','application_registration_payments','password_setup_invitations']:
        if c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():raise RuntimeError(name+' history is retained; use reviewed recovery.')
    for name,label in [('application_submissions','Submission provenance'),('savings_interests','Savings interests')]:
        if c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():raise RuntimeError(label+' is retained; use reviewed recovery.')
    for name in ['fee_rate_versions','business_settings_versions']:
        if c.execute(sa.text(f'SELECT count(*) FROM {name} WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(name+' history is retained; use reviewed recovery.')
    for name in ['subscription_fee_payments','fee_obligations','fee_rate_publications','fee_rate_versions']:op.drop_table(name)
