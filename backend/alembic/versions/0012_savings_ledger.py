"""Add isolated savings workflow and append-only ledger; never backfill legacy money."""
from alembic import op
import sqlalchemy as sa
revision='0012_savings_ledger'
down_revision='0011_documents_enrolment'
branch_labels=depends_on=None
TABLES=['savings_contributions','savings_events','savings_ledger_entries']
CODES=['savings:read','savings:record','savings:verify','savings:reconcile','savings:reverse','savings:extra','savings:own']


def fk(name,target,**kw):return sa.Column(name,sa.Integer(),sa.ForeignKey(target,ondelete='RESTRICT'),**kw)
def stamp():return sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False)
def string(name,n):return sa.Column(name,sa.String(n),nullable=False)
def txt(name):return sa.Column(name,sa.Text(),nullable=False)


def upgrade():
    op.create_table('savings_contributions',sa.Column('id',sa.Integer(),primary_key=True),
        fk('enrolment_id','plan_enrolments.application_id',nullable=False),fk('member_id','members.id',nullable=False),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),string('currency',10),sa.Column('payment_date',sa.Date(),nullable=False),
        string('method',100),string('reference',100),sa.Column('reference_key',sa.String(64),nullable=False,unique=True),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),txt('request_snapshot'),txt('policy_snapshot'),txt('flags'),string('status',40),
        fk('recorded_by','users.id',nullable=False),stamp(),sa.CheckConstraint('amount > 0',name='ck_savings_positive'))
    op.create_table('savings_events',sa.Column('id',sa.Integer(),primary_key=True),fk('contribution_id','savings_contributions.id',nullable=False),
        string('action',40),string('outcome',40),string('evidence_reference',200),txt('reason'),fk('actor_id','users.id',nullable=False),string('actor_email',255),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),txt('request_snapshot'),stamp())
    op.create_table('savings_ledger_entries',sa.Column('id',sa.Integer(),primary_key=True),fk('contribution_id','savings_contributions.id',nullable=False),
        fk('member_id','members.id',nullable=False),string('kind',20),sa.Column('amount',sa.Numeric(12,2),nullable=False),string('currency',10),
        fk('reverses_id','savings_ledger_entries.id',nullable=True,unique=True),fk('event_id','savings_events.id',nullable=False,unique=True),stamp(),
        sa.UniqueConstraint('contribution_id','kind',name='uq_savings_posting_kind'),
        sa.CheckConstraint("(kind = 'Credit' AND amount > 0 AND reverses_id IS NULL) OR (kind = 'Reversal' AND amount < 0 AND reverses_id IS NOT NULL)",name='ck_savings_entry_sign'))
    for table,columns in [('savings_contributions',['enrolment_id','member_id']),('savings_events',['contribution_id']),('savings_ledger_entries',['contribution_id','member_id'])]:
        for column in columns:op.create_index('ix_'+table+'_'+column,table,[column])
    c=op.get_bind()
    for code in CODES:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'),{'code':code})
        role='member' if code=='savings:own' else 'administrator'
        c.execute(sa.text('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name=:role AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)'),{'role':role,'code':code})
    if c.dialect.name=='postgresql':
        op.execute("CREATE FUNCTION savings_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Savings history is append only'; END $$")
        for table in ['savings_events','savings_ledger_entries']:
            op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION savings_immutable()')
        op.execute("""CREATE FUNCTION savings_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
                RAISE EXCEPTION 'Original savings payment fields are immutable'; END IF; RETURN NEW; END $$""")
        op.execute('CREATE TRIGGER savings_payment_immutable BEFORE UPDATE ON savings_contributions FOR EACH ROW EXECUTE FUNCTION savings_record_immutable()')
        op.execute("""CREATE FUNCTION savings_posting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
            IF NOT EXISTS (SELECT 1 FROM savings_contributions c JOIN savings_events e ON e.contribution_id=c.id
                WHERE c.id=NEW.contribution_id AND e.id=NEW.event_id AND c.member_id=NEW.member_id AND c.currency=NEW.currency
                AND ((NEW.kind='Credit' AND c.status='Confirmed' AND NEW.amount=c.amount AND e.action='reconcile' AND e.outcome='Matched')
                OR (NEW.kind='Reversal' AND c.status='Reversed' AND e.action='reverse' AND e.outcome='Reversed'
                AND EXISTS (SELECT 1 FROM savings_ledger_entries original WHERE original.id=NEW.reverses_id
                    AND original.kind='Credit' AND original.contribution_id=c.id AND original.member_id=NEW.member_id
                    AND original.currency=NEW.currency AND NEW.amount=-original.amount))))
            THEN RAISE EXCEPTION 'Savings posting must match its contribution and audited action'; END IF;
            RETURN NEW; END $$""")
        op.execute('CREATE TRIGGER savings_posting_guard BEFORE INSERT ON savings_ledger_entries FOR EACH ROW EXECUTE FUNCTION savings_posting_guard()')
    elif c.dialect.name=='sqlite':
        for table in ['savings_events','savings_ledger_entries']:
            for action in ['UPDATE','DELETE']:
                op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Savings history is append only'); END")


def downgrade():
    c=op.get_bind()
    for name,label in [('application_submissions','Submission provenance'),('savings_interests','Savings interests'),
        ('plan_draft_versions','plan_draft_versions history'),('application_settings_snapshots','application_settings_snapshots history'),
        ('subscription_settings_snapshots','subscription_settings_snapshots history'),('membership_approvals','membership_approvals history'),
        ('application_registration_payments','application_registration_payments history'),('password_setup_invitations','password_setup_invitations history'),
        ('fee_obligations','fee_obligations history'),('subscription_fee_payments','subscription_fee_payments history'),('fee_rate_publications','fee_rate_publications history')]:
        if c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():raise RuntimeError(label+' is retained; use reviewed recovery.')
    for name in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text(f'SELECT count(*) FROM {name} WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(name+' history is retained; use reviewed recovery.')
    for name in TABLES+['registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events']:
        if c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():raise RuntimeError('Financial/document/plan history is retained; use reviewed recovery.')
    for code in CODES:
        c.execute(sa.text('DELETE FROM user_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text('DELETE FROM permissions WHERE code=:code'),{'code':code})
    for table in reversed(TABLES):op.drop_table(table)
    if c.dialect.name=='postgresql':
        op.execute('DROP FUNCTION savings_immutable()')
        op.execute('DROP FUNCTION savings_record_immutable()')
        op.execute('DROP FUNCTION savings_posting_guard()')
