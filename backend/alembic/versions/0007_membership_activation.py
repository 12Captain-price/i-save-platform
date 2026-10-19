"""Application fee, membership activation and hashed single-use setup invitations."""
from alembic import op
import sqlalchemy as sa
revision='0007_membership_activation'
down_revision='0006_assisted_registration'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('application_registration_payments',
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='RESTRICT'),primary_key=True),
        sa.Column('member_id',sa.Integer(),sa.ForeignKey('members.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('reference',sa.String(80),nullable=False),sa.Column('reference_key',sa.String(80),nullable=False),
        sa.Column('amount',sa.Numeric(12,2),nullable=False),sa.Column('currency',sa.String(10),nullable=False),
        sa.Column('payment_date',sa.Date(),nullable=False),
        sa.Column('recorded_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('recorder_email',sa.String(255),nullable=False),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('verified_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('verifier_email',sa.String(255),nullable=True),sa.Column('verified_at',sa.DateTime(timezone=True),nullable=True))
    op.create_index('ix_application_registration_payments_member_id','application_registration_payments',['member_id'])
    op.create_index('ix_application_registration_payments_reference_key','application_registration_payments',['reference_key'],unique=True)
    op.create_table('membership_approvals',
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='RESTRICT'),primary_key=True),
        sa.Column('member_id',sa.Integer(),sa.ForeignKey('members.id',ondelete='RESTRICT'),nullable=False,unique=True),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False,unique=True),
        sa.Column('approved_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('approver_email',sa.String(255),nullable=False),sa.Column('approved_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('acknowledgement_version',sa.String(80),nullable=False),sa.Column('acknowledgement_text',sa.Text(),nullable=False),
        sa.Column('activated_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=True),
        sa.Column('activator_email',sa.String(255),nullable=True),sa.Column('activated_at',sa.DateTime(timezone=True),nullable=True),
        sa.Column('subscription_start_month',sa.String(7),nullable=True))
    op.create_table('password_setup_invitations',
        sa.Column('token_hash',sa.String(64),primary_key=True),
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('request_key',sa.String(36),nullable=False,unique=True),
        sa.Column('issued_by',sa.Integer(),sa.ForeignKey('users.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('issued_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False),sa.Column('consumed_at',sa.DateTime(timezone=True),nullable=True),
        sa.Column('revoked_at',sa.DateTime(timezone=True),nullable=True),sa.Column('provider_message_id',sa.String(255),nullable=True),
        sa.Column('delivery_state',sa.String(30),nullable=False))
    op.create_index('ix_password_setup_invitations_application_id','password_setup_invitations',['application_id'])
    op.create_index('ix_password_setup_invitations_user_id','password_setup_invitations',['user_id'])
    c=op.get_bind()
    for code in ['registration-fees:record','registration-fees:verify','membership:approve','membership:activate','invitations:issue']:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'),{'code':code})
        c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"),{'code':code})


def downgrade():
    # Preflight retained downstream history before any DDL. SQLite DDL is not
    # reliably rolled back if a later revision refuses a multi-step downgrade.
    for name,label in [('application_submissions','Submission provenance'),('savings_interests','Savings interests')]:
        if op.get_bind().execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():
            raise RuntimeError(label+' is retained; use reviewed recovery.')
    for name in ['password_setup_invitations','membership_approvals','application_registration_payments']:
        if op.get_bind().execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():
            raise RuntimeError('Membership/payment/invitation records are retained; use reviewed recovery.')
    for name in ['password_setup_invitations','membership_approvals','application_registration_payments']:op.drop_table(name)
