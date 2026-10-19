"""Add revocable sessions, login throttles and individual permission overrides.

No existing accounts, roles, credentials or business rows are changed.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_authentication"
down_revision = "0002_enrolment_timestamps"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("auth_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table("user_permissions",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("allowed", sa.Boolean(), nullable=False))
    op.create_table("login_throttles",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("login_throttles")
    op.drop_table("user_permissions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
