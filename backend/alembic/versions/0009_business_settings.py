"""Preserve existing approved business values as a published baseline."""
import json
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa

revision='0009_business_settings'
down_revision='0008_plan_drafts'
branch_labels=None
depends_on=None

# Frozen migration values, independent of editable/runtime configuration.
BASELINE={
 'office':'5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe',
 'email':'zpyfinfo@gmail.com','office_phone':'+263 29 226 1341',
 'director_phone':'+263 78 552 1029','additional_phone':'+263 78 663 9536',
 'registration_amount':'20.00','registration_currency':'USD',
 'subscription_amount':'5.00','subscription_currency':'USD',
 'subscription_start':'next_calendar_month','subscription_due_day':None,
 'review_acknowledgement':'I have reviewed the application and the verified US$20 registration fee. I understand that approval does not itself activate the account or approve a savings plan.'}


def upgrade():
    versions=op.create_table('business_settings_versions',
        sa.Column('id',sa.Integer(),primary_key=True),sa.Column('base_version',sa.Integer(),nullable=False),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),sa.Column('snapshot',sa.Text(),nullable=False),
        sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('actor_email',sa.String(255),nullable=True),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    publications=op.create_table('business_settings_publications',
        sa.Column('id',sa.Integer(),primary_key=True),
        sa.Column('version_id',sa.Integer(),sa.ForeignKey('business_settings_versions.id',ondelete='RESTRICT'),nullable=False,unique=True),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),
        sa.Column('request_snapshot',sa.Text(),nullable=False),
        sa.Column('effective_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('actor_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('actor_email',sa.String(255),nullable=True),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('application_settings_snapshots',
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='RESTRICT'),primary_key=True),
        sa.Column('version_id',sa.Integer(),sa.ForeignKey('business_settings_versions.id',ondelete='RESTRICT'),nullable=False))
    op.create_table('subscription_settings_snapshots',
        sa.Column('subscription_id',sa.Integer(),sa.ForeignKey('subscriptions.id',ondelete='RESTRICT'),primary_key=True),
        sa.Column('version_id',sa.Integer(),sa.ForeignKey('business_settings_versions.id',ondelete='RESTRICT'),nullable=False))
    c=op.get_bind()
    identifier=c.execute(versions.insert().values(base_version=0,request_key='00000000-0000-0000-0000-000000000009',snapshot=json.dumps(BASELINE,sort_keys=True))).inserted_primary_key[0]
    c.execute(publications.insert().values(version_id=identifier,request_key='00000000-0000-0000-0000-000000000019',request_snapshot='preserved baseline migration',effective_at=datetime(1970,1,1,tzinfo=timezone.utc)))
    for code in ['settings:read','settings:write','settings:publish']:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"),{'code':code})


def downgrade():
    c=op.get_bind()
    # Never discard snapshots or downstream history, even in a multi-step rollback.
    guards=[('business_settings_versions','SELECT count(*) FROM business_settings_versions WHERE actor_id IS NOT NULL'),
        *[(n,f'SELECT count(*) FROM {n}') for n in ['application_settings_snapshots','subscription_settings_snapshots','plan_draft_versions','application_submissions','savings_interests','password_setup_invitations','membership_approvals','application_registration_payments']]]
    for name,query in guards:
        if c.execute(sa.text(query)).scalar():raise RuntimeError(({'application_submissions':'Submission provenance','savings_interests':'Savings interests'}.get(name,name)+(' is retained; use reviewed recovery.' if name in {'application_submissions','savings_interests'} else ' history is retained; use reviewed recovery.')))
    for name in ['subscription_settings_snapshots','application_settings_snapshots','business_settings_publications','business_settings_versions']:op.drop_table(name)
