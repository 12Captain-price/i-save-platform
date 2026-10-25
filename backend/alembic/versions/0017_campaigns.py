"""Optional consent and isolated, explicitly queued announcement campaigns."""
from alembic import op
import sqlalchemy as sa
revision='0017_campaigns'
down_revision='0016_content_support'
branch_labels=depends_on=None
CODES=['campaigns:read','campaigns:prepare','campaigns:approve','campaigns:send','campaigns:recipients','marketing:own']
TABLES=['marketing_preferences','marketing_consent_events','campaigns','campaign_versions','campaign_events','campaign_recipients','campaign_delivery_events','campaign_unsubscribe_links']
IMMUTABLE=['marketing_consent_events','campaign_versions','campaign_events','campaign_delivery_events']
def pk():return sa.Column('id',sa.Integer(),primary_key=True)
def fk(n,t,**kw):return sa.Column(n,sa.Integer(),sa.ForeignKey(t,ondelete='RESTRICT'),**kw)
def s(n,l):return sa.Column(n,sa.String(l),nullable=False)
def dt(n='recorded_at',**kw):return sa.Column(n,sa.DateTime(timezone=True),**kw)
def stamp():return dt(nullable=False,server_default=sa.func.now())
def actor():return [fk('actor_id','users.id',nullable=False),s('actor_email',255)]
def request():return [sa.Column('request_key',sa.String(36),nullable=False,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False)]
def upgrade():
    op.create_table('marketing_preferences',fk('user_id','users.id',primary_key=True),sa.Column('enabled',sa.Boolean(),nullable=False),sa.Column('revision',sa.Integer(),nullable=False))
    op.create_table('marketing_consent_events',pk(),fk('user_id','users.id',nullable=False,index=True),sa.Column('enabled',sa.Boolean(),nullable=False),s('source',40),sa.Column('wording',sa.Text(),nullable=False),s('version',50),fk('actor_id','users.id'),sa.Column('request_key',sa.String(80),nullable=False,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False),stamp())
    op.create_table('campaigns',pk(),sa.Column('latest_version',sa.Integer(),nullable=False),s('state',30),dt('scheduled_at'))
    op.create_table('campaign_versions',pk(),fk('campaign_id','campaigns.id',nullable=False,index=True),sa.Column('version',sa.Integer(),nullable=False),fk('content_version_id','content_versions.id',nullable=False),sa.Column('snapshot',sa.Text(),nullable=False),*actor(),*request(),stamp(),sa.UniqueConstraint('campaign_id','version',name='uq_campaign_version'))
    op.create_table('campaign_events',pk(),fk('campaign_id','campaigns.id',nullable=False,index=True),fk('version_id','campaign_versions.id',nullable=False),s('action',30),s('reason',1000),*actor(),*request(),stamp())
    op.create_table('campaign_recipients',pk(),fk('campaign_id','campaigns.id',nullable=False,index=True),fk('version_id','campaign_versions.id',nullable=False),fk('user_id','users.id',nullable=False),s('email_snapshot',255),s('state',40),sa.Column('attempts',sa.Integer(),nullable=False),dt('attempted_at'),s('reason',300),sa.UniqueConstraint('campaign_id','user_id',name='uq_campaign_recipient'))
    op.create_table('campaign_delivery_events',pk(),fk('recipient_id','campaign_recipients.id',nullable=False,index=True),s('state',40),s('reason',300),stamp())
    op.create_table('campaign_unsubscribe_links',sa.Column('token_hash',sa.String(64),primary_key=True),fk('recipient_id','campaign_recipients.id',nullable=False,index=True),dt('expires_at',nullable=False),dt('consumed_at'))
    c=op.get_bind()
    for code in CODES:
        if not c.execute(sa.text('SELECT id FROM permissions WHERE code=:code'),{'code':code}).first():c.execute(sa.text('INSERT INTO permissions(code) VALUES (:code)'),{'code':code})
        c.execute(sa.text('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.name=:role AND p.code=:code AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)'),{'code':code,'role':'member' if code.endswith(':own') else 'administrator'})
    if c.dialect.name=='postgresql':
        op.execute("CREATE FUNCTION campaign_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Campaign/consent history is immutable'; END $$")
        for table in IMMUTABLE:op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION campaign_history_immutable()')
    else:
        for table in IMMUTABLE:
            for action in ['UPDATE','DELETE']:op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Campaign/consent history is immutable'); END")
def downgrade():
    c=op.get_bind()
    # SQLite cannot roll back DDL across a refused multi-revision downgrade.
    # Preflight retained older history before removing even empty new tables.
    retained=TABLES+['account_links','notifications','recovery_requests','application_submissions','savings_interests','membership_approvals','application_registration_payments','password_setup_invitations','plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots','fee_obligations','subscription_fee_payments','fee_rate_publications','registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events','savings_contributions','savings_events','savings_ledger_entries','withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits','content_versions','content_events','public_media','support_tickets','ticket_events','ticket_messages']
    for t in retained:
        if c.execute(sa.text('SELECT count(*) FROM '+t)).scalar():
            label='Submission provenance' if t=='application_submissions' else t+' history'
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for t in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+t+' WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(t+' history is retained; use reviewed recovery')
    if c.execute(sa.text('SELECT count(*) FROM user_permissions')).scalar():raise RuntimeError('Permission history is retained; use reviewed recovery')
    # Preflight older delegated grants too, so an older migration cannot refuse
    # later in a SQLite downgrade after these tables have already been removed.
    basic={'staff':{'members:read','applications:read','plans:read'},'finance':{'members:read','contributions:read','fees:read','subscriptions:read','verifications:read','plans:read'}}
    for role,code in c.execute(sa.text('SELECT r.name,p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id')):
        canonical=(role=='administrator' and not code.endswith(':own')) or (role=='member' and code.endswith(':own')) or code in basic.get(role,set())
        if not canonical:raise RuntimeError('Delegated permission history is retained; use reviewed recovery')
    for code in CODES:
        if c.execute(sa.text('SELECT count(*) FROM user_permissions u JOIN permissions p ON p.id=u.permission_id WHERE p.code=:code'),{'code':code}).scalar():raise RuntimeError('Permission history is retained')
        if c.execute(sa.text('SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code AND r.name<>:role'),{'code':code,'role':'member' if code.endswith(':own') else 'administrator'}).scalar():raise RuntimeError('Delegated permission history is retained')
    for t in reversed(TABLES):op.drop_table(t)
    if c.dialect.name=='postgresql':op.execute('DROP FUNCTION campaign_history_immutable()')
    for code in CODES:
        c.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN(SELECT id FROM permissions WHERE code=:code)'),{'code':code});c.execute(sa.text('DELETE FROM permissions WHERE code=:code'),{'code':code})
