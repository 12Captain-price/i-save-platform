"""Separate optional savings-category interests, without approved plan terms."""
from alembic import op
import sqlalchemy as sa

revision = "0005_savings_interest"
down_revision = "0004_pending_registration"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("savings_interests",
        sa.Column("id",sa.Integer(),primary_key=True),
        sa.Column("application_id",sa.Integer(),sa.ForeignKey("membership_applications.id",ondelete="CASCADE"),nullable=False),
        sa.Column("category",sa.String(30),nullable=False),
        sa.Column("category_label",sa.String(50),nullable=False),
        sa.Column("purpose",sa.Text(),nullable=False),
        sa.Column("notice_version",sa.String(80),nullable=False),
        sa.Column("notice_text",sa.Text(),nullable=False),
        sa.Column("recorded_at",sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_index("ix_savings_interests_application_id","savings_interests",["application_id"],unique=True)


def downgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM savings_interests")).scalar():
        raise RuntimeError("Savings interests are retained; use a verified backup for reviewed rollback.")
    op.drop_index("ix_savings_interests_application_id",table_name="savings_interests")
    op.drop_table("savings_interests")
