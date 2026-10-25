"""Versioned publishing and owned support history; no content/ticket seeding."""
from alembic import op
import sqlalchemy as sa
revision='0016_content_support'
down_revision='0015_account_workflows'
branch_labels=depends_on=None
CODES=['content:read','content:draft','content:review','content:publish','content:archive','support:own','support:read','support:reply','support:internal','support:assign','support:resolve']
TABLES=['content_items','public_media','content_versions','content_events','support_tickets','ticket_events','ticket_messages']
IMMUTABLE=['public_media','content_versions','content_events','ticket_events','ticket_messages']
def fk(n,t,**kw):return sa.Column(n,sa.Integer(),sa.ForeignKey(t,ondelete='RESTRICT'),**kw)
def string(n,l,**kw):return sa.Column(n,sa.String(l),nullable=False,**kw)
def stamp(n='recorded_at'):return sa.Column(n,sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now())
def actor():return [fk('actor_id','users.id',nullable=False),string('actor_email',255)]
def request():return [string('request_key',36,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False)]


def upgrade():
    op.create_table('content_items',sa.Column('id',sa.Integer(),primary_key=True),string('kind',20),sa.Column('latest_version',sa.Integer(),nullable=False))
    op.create_table('public_media',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('content',sa.LargeBinary(),nullable=False),string('content_type',20),string('sha256',64),string('scan_engine',100),string('alt',300),string('rights_note',500),fk('actor_id','users.id',nullable=False),string('request_key',36,unique=True),stamp())
    op.create_table('content_versions',sa.Column('id',sa.Integer(),primary_key=True),fk('item_id','content_items.id',nullable=False,index=True),sa.Column('version',sa.Integer(),nullable=False),sa.Column('snapshot',sa.Text(),nullable=False),fk('media_id','public_media.id'),*actor(),*request(),stamp(),sa.UniqueConstraint('item_id','version',name='uq_content_version'))
    op.create_table('content_events',sa.Column('id',sa.Integer(),primary_key=True),fk('version_id','content_versions.id',nullable=False,index=True),string('state',30),string('reason',1000),sa.Column('effective_at',sa.DateTime(timezone=True)),*actor(),*request(),stamp())
    op.create_table('support_tickets',sa.Column('id',sa.Integer(),primary_key=True),string('number',40,unique=True),fk('user_id','users.id',nullable=False,index=True),string('category',30),string('subject',200),string('status',30),sa.Column('revision',sa.Integer(),nullable=False),fk('assigned_to','users.id'),stamp('created_at'))
    op.create_table('ticket_events',sa.Column('id',sa.Integer(),primary_key=True),fk('ticket_id','support_tickets.id',nullable=False,index=True),string('action',30),string('status',30),string('reason',1000),fk('assigned_to','users.id'),*actor(),*request(),stamp())
    op.create_table('ticket_messages',sa.Column('id',sa.Integer(),primary_key=True),fk('ticket_id','support_tickets.id',nullable=False,index=True),fk('event_id','ticket_events.id',nullable=False,unique=True),sa.Column('internal',sa.Boolean(),nullable=False),sa.Column('body',sa.Text(),nullable=False),*actor(),stamp())
    c=op.get_bind()
    for code in CODES:
        if not c.execute(sa.text('SELECT id FROM permissions WHERE code=:code'),{'code':code}).first():
            c.execute(sa.text('INSERT INTO permissions(code) VALUES (:code)'),{'code':code})
        c.execute(sa.text('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.name=:role AND p.code=:code AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)'),{'code':code,'role':'member' if code.endswith(':own') else 'administrator'})
    if c.dialect.name=='postgresql':
        op.execute("CREATE FUNCTION content_support_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Editorial/support history is immutable'; END $$")
        for table in IMMUTABLE:op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION content_support_immutable()')
    else:
        for table in IMMUTABLE:
            for action in ['UPDATE','DELETE']:op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Editorial/support history is immutable'); END")


def downgrade():
    c=op.get_bind()
    retained=TABLES+['account_links','notifications','recovery_requests','application_submissions','savings_interests','membership_approvals','application_registration_payments','password_setup_invitations','plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots','fee_obligations','subscription_fee_payments','fee_rate_publications','registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events','savings_contributions','savings_events','savings_ledger_entries','withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits']
    for table in retained:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            label='Submission provenance' if table=='application_submissions' else 'Savings interests' if table=='savings_interests' else table+' history'
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for table in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+table+' WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(table+' history is retained; use reviewed recovery')
    # Refuse removal of delegated permissions or explicit security decisions.
    for code in CODES:
        if c.execute(sa.text('SELECT count(*) FROM user_permissions u JOIN permissions p ON p.id=u.permission_id WHERE p.code=:code'),{'code':code}).scalar():raise RuntimeError('Permission history retained')
        if c.execute(sa.text('SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code AND r.name<>:role'),{'code':code,'role':'member' if code.endswith(':own') else 'administrator'}).scalar():raise RuntimeError('Delegated permission history retained')
    for table in reversed(TABLES):op.drop_table(table)
    if c.dialect.name=='postgresql':op.execute('DROP FUNCTION content_support_immutable()')
    for code in CODES:
        c.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN(SELECT id FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text('DELETE FROM permissions WHERE code=:code'),{'code':code})
