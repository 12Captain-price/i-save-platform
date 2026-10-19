"""Assisted submission provenance and a dedicated permission; no staff auto-grant."""
from alembic import op
import sqlalchemy as sa

revision = '0006_assisted_registration'
down_revision = '0005_savings_interest'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('application_submissions',
        sa.Column('application_id',sa.Integer(),sa.ForeignKey('membership_applications.id',ondelete='CASCADE'),primary_key=True),
        sa.Column('source',sa.String(30),nullable=False),
        sa.Column('actor_user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='SET NULL'),nullable=True),
        sa.Column('actor_email',sa.String(255),nullable=True),
        sa.Column('applicant_authorized',sa.Boolean(),nullable=False,server_default=sa.false()),
        sa.Column('authorization_version',sa.String(80),nullable=True),
        sa.Column('authorization_text',sa.Text(),nullable=True),
        sa.Column('authorized_at',sa.DateTime(timezone=True),nullable=True),
        sa.Column('recorded_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    c=op.get_bind()
    # Add exactly one known capability; retain all prior grants and denials.
    c.execute(sa.text("INSERT INTO permissions(code,description) SELECT 'applications:assist','Submit pending applications with applicant authorisation' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code='applications:assist')"))
    c.execute(sa.text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='administrator' AND p.code='applications:assist' AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)"))


def downgrade():
    if op.get_bind().execute(sa.text('SELECT count(*) FROM application_submissions')).scalar():
        raise RuntimeError('Submission provenance is retained; use a verified backup for reviewed rollback.')
    op.drop_table('application_submissions')
    # Keep permission catalog/grants rather than erase later administrative changes.
