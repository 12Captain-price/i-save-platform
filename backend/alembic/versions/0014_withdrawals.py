"""Private withdrawal reservations and append-only payout debits; policy stays unset."""
from alembic import op
import sqlalchemy as sa
revision='0014_withdrawals'
down_revision='0013_recurring_reports'
branch_labels=depends_on=None
CODES=['withdrawals:own','withdrawals:read','withdrawals:approve','withdrawals:process','withdrawals:verify']
TABLES=['withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits']


def fk(name,target,**kw):return sa.Column(name,sa.Integer(),sa.ForeignKey(target,ondelete='RESTRICT'),**kw)
def string(name,size,nullable=False,**kw):return sa.Column(name,sa.String(size),nullable=nullable,**kw)
def stamp(name='recorded_at',nullable=False,default=True):return sa.Column(name,sa.DateTime(timezone=True),nullable=nullable,server_default=sa.func.now() if default else None)


def upgrade():
    op.create_table('withdrawal_requests',sa.Column('id',sa.Integer(),primary_key=True),
        fk('enrolment_id','plan_enrolments.application_id',nullable=False,index=True),fk('member_id','members.id',nullable=False,index=True),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),string('currency',10),string('status',30),
        sa.Column('terms_snapshot',sa.Text(),nullable=False),sa.Column('policy_snapshot',sa.Text(),nullable=False),
        fk('settings_version','business_settings_versions.id'),sa.Column('completion_date',sa.Date(),nullable=False),
        stamp('requested_at',default=False),stamp('notice_ends_at',default=False),fk('actor_id','users.id',nullable=False),
        string('request_key',36,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False),sa.CheckConstraint('amount>0',name='ck_withdrawal_positive'))
    op.create_table('withdrawal_events',sa.Column('id',sa.Integer(),primary_key=True),fk('withdrawal_id','withdrawal_requests.id',nullable=False,index=True),
        string('action',40),string('outcome',30),string('reason',2000),string('evidence_reference',200),fk('actor_id','users.id',nullable=False),
        string('actor_email',255),string('request_key',36,unique=True),sa.Column('request_snapshot',sa.Text(),nullable=False),stamp())
    op.create_table('withdrawal_payouts',fk('withdrawal_id','withdrawal_requests.id',primary_key=True),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),string('currency',10),string('method',30),sa.Column('payment_date',sa.Date(),nullable=False),stamp('payment_at',default=False),
        string('reference',100),string('reference_key',64,unique=True),fk('recorded_by','users.id',nullable=False),stamp(),
        fk('verified_by','users.id'),stamp('verified_at',nullable=True,default=False))
    op.create_table('withdrawal_debits',sa.Column('id',sa.Integer(),primary_key=True),fk('withdrawal_id','withdrawal_payouts.withdrawal_id',nullable=False,unique=True),
        fk('enrolment_id','plan_enrolments.application_id',nullable=False,index=True),fk('member_id','members.id',nullable=False,index=True),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),string('currency',10),fk('event_id','withdrawal_events.id',nullable=False,unique=True),stamp(),
        sa.CheckConstraint('amount<0',name='ck_withdrawal_debit_negative'))
    c=op.get_bind()
    for code in CODES:
        if not c.execute(sa.text('SELECT id FROM permissions WHERE code=:code'),{'code':code}).first():c.execute(sa.text('INSERT INTO permissions(code) VALUES (:code)'),{'code':code})
        role='member' if code.endswith(':own') else 'administrator'
        c.execute(sa.text('INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.name=:role AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id)'),{'role':role,'code':code})
    if c.dialect.name=='postgresql':
        for table in ['withdrawal_events','withdrawal_debits']:
            op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION savings_immutable()')
        op.execute("""CREATE FUNCTION withdrawal_request_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Withdrawal history is retained'; END IF;
          IF (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') THEN RAISE EXCEPTION 'Withdrawal snapshot is immutable'; END IF;
          IF OLD.status IN ('Paid','Rejected','Cancelled','Failed') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Terminal withdrawal history is retained'; END IF;
          RETURN NEW; END $$""")
        op.execute('CREATE TRIGGER withdrawal_request_immutable BEFORE UPDATE OR DELETE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION withdrawal_request_immutable()')
        op.execute("""CREATE FUNCTION withdrawal_payout_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payout history is retained'; END IF;
          IF (to_jsonb(OLD)-ARRAY['verified_by','verified_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['verified_by','verified_at']) OR OLD.verified_at IS NOT NULL THEN RAISE EXCEPTION 'Payout evidence is immutable'; END IF;
          RETURN NEW; END $$""")
        op.execute('CREATE TRIGGER withdrawal_payout_immutable BEFORE UPDATE OR DELETE ON withdrawal_payouts FOR EACH ROW EXECUTE FUNCTION withdrawal_payout_immutable()')
        op.execute("""CREATE FUNCTION withdrawal_posting_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM withdrawal_requests r JOIN withdrawal_payouts p ON p.withdrawal_id=r.id JOIN withdrawal_events e ON e.withdrawal_id=r.id
            WHERE r.id=NEW.withdrawal_id AND r.status='Paid' AND p.verified_at IS NOT NULL AND r.member_id=NEW.member_id AND r.enrolment_id=NEW.enrolment_id
            AND r.currency=NEW.currency AND p.currency=r.currency AND p.amount=r.amount AND NEW.amount=-r.amount AND p.payment_at>=r.notice_ends_at AND p.verified_at>=r.notice_ends_at
            AND e.id=NEW.event_id AND e.actor_id=p.verified_by AND e.action='verify' AND e.outcome='Paid') THEN RAISE EXCEPTION 'Withdrawal debit requires verified linked payout'; END IF;
          RETURN NEW; END $$""")
        op.execute('CREATE TRIGGER withdrawal_posting_guard BEFORE INSERT ON withdrawal_debits FOR EACH ROW EXECUTE FUNCTION withdrawal_posting_guard()')
    else:
        for table in ['withdrawal_events','withdrawal_debits']:
            for action in ['UPDATE','DELETE']:op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Withdrawal history is retained'); END")


def downgrade():
    c=op.get_bind()
    for table in TABLES:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():raise RuntimeError('Withdrawal history is retained; use reviewed recovery')
    # Run older retention preflight before changing SQLite migration history.
    # Protect all retained non-seed workflow history first.
    for table in ['application_submissions','savings_interests','membership_approvals','application_registration_payments','password_setup_invitations','plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots','fee_obligations','subscription_fee_payments','fee_rate_publications','registration_evidence_profiles','application_evidence','evidence_reviews','plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events','savings_contributions','savings_events','savings_ledger_entries']:
        if c.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            label='Submission provenance' if table=='application_submissions' else 'Savings interests' if table=='savings_interests' else table+' history'
            raise RuntimeError(label+' is retained; use reviewed recovery')
    for table in ['business_settings_versions','fee_rate_versions']:
        if c.execute(sa.text('SELECT count(*) FROM '+table+' WHERE actor_id IS NOT NULL')).scalar():raise RuntimeError(table+' history is retained; use reviewed recovery')
    for code in CODES:
        if c.execute(sa.text('SELECT count(*) FROM user_permissions WHERE permission_id IN(SELECT id FROM permissions WHERE code=:code)'),{'code':code}).scalar():raise RuntimeError('Permission history is retained')
        canonical='member' if code.endswith(':own') else 'administrator'
        if c.execute(sa.text('SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code AND r.name<>:role'),{'code':code,'role':canonical}).scalar():raise RuntimeError('Delegated permission history is retained')
    if c.dialect.name=='postgresql':
        for name in ['withdrawal_posting_guard','withdrawal_payout_immutable','withdrawal_request_immutable']:op.execute('DROP FUNCTION '+name+'() CASCADE')
    for table in reversed(TABLES):op.drop_table(table)
    for code in CODES:
        c.execute(sa.text('DELETE FROM role_permissions WHERE permission_id IN(SELECT id FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text('DELETE FROM permissions WHERE code=:code'),{'code':code})
