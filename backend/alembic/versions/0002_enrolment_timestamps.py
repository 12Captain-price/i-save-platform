"""Align legacy create_all enrolments with the migration-owned schema.

The initial migration already has timestamps; legacy ORM-created tables do not.
Use the supported SQLite batch migration for populated legacy tables because
SQLite cannot ADD COLUMN with a nonconstant current-timestamp default.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_enrolment_timestamps"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("member_plans")}
    missing = {"created_at", "updated_at"} - columns
    if missing:
        with op.batch_alter_table("member_plans", recreate="auto") as batch:
            for name in sorted(missing):
                batch.add_column(sa.Column(
                    name, sa.DateTime(timezone=True),
                    server_default=sa.func.now(), nullable=False,
                ))


def downgrade() -> None:
    # Initial migration defines these columns too. Keep data and timestamps
    # when returning to its revision rather than destroying history.
    pass
