"""Add public registration deduplication and honest application history.

Existing applications/accounts/members/financial records are unchanged.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_pending_registration"
down_revision = "0003_authentication"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("registration_submissions",
        sa.Column("email_hash", sa.String(64), primary_key=True),
        sa.Column("application_id", sa.Integer(), sa.ForeignKey("membership_applications.id", ondelete="SET NULL"), nullable=True))
    op.create_table("application_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("application_id", sa.Integer(), sa.ForeignKey("membership_applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_application_events_application_id", "application_events", ["application_id"])
    op.execute(sa.text("INSERT INTO application_events (application_id,status,note) SELECT id,status,'Status recorded during history migration; earlier transitions are unavailable.' FROM membership_applications"))


def downgrade():
    connection = op.get_bind()
    for table in ("application_events", "registration_submissions"):
        if connection.execute(sa.text(f"SELECT count(*) FROM {table}")).scalar():
            raise RuntimeError("Registration history is retained. Restore a verified pre-migration backup for rollback.")
    op.drop_index("ix_application_events_application_id", table_name="application_events")
    op.drop_table("application_events")
    op.drop_table("registration_submissions")
