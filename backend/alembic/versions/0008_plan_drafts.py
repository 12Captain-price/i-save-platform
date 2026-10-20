"""Separate, unpublished savings configuration and append-only snapshots."""
from alembic import op
import sqlalchemy as sa

revision = '0008_plan_drafts'
down_revision = '0007_membership_activation'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('plan_drafts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('latest_version', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table('plan_draft_versions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('draft_id', sa.Integer(), sa.ForeignKey('plan_drafts.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('request_key', sa.String(36), nullable=False, unique=True),
        sa.Column('snapshot', sa.Text(), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('actor_email', sa.String(255), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('draft_id', 'version', name='uq_plan_draft_version'))
    op.create_index('ix_plan_draft_versions_draft_id', 'plan_draft_versions', ['draft_id'])
    c = op.get_bind()
    for code in ['plans:drafts:read', 'plans:drafts:write']:
        c.execute(sa.text('INSERT INTO permissions(code) SELECT CAST(:code AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=:code)'), {'code': code})
        c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code=:code AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"), {'code': code})


def downgrade():
    # Preflight before any DDL, including a multi-revision SQLite downgrade.
    for name, label in [('plan_draft_versions', 'Draft version history'),
                        ('application_submissions', 'Submission provenance'), ('savings_interests', 'Savings interests'),
                        ('password_setup_invitations', 'Membership/payment/invitation records'),
                        ('membership_approvals', 'Membership/payment/invitation records'),
                        ('application_registration_payments', 'Membership/payment/invitation records')]:
        if op.get_bind().execute(sa.text(f'SELECT count(*) FROM {name}')).scalar():
            raise RuntimeError(label + ' is retained; use reviewed recovery.')
    op.drop_table('plan_draft_versions')
    op.drop_table('plan_drafts')
