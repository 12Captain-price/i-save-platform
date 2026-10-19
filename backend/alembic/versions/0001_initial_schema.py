"""Initial schema

Core entities for the i-Save backend:
roles, permissions, role_permissions, users, members, savings_plans,
member_plans, consent_records, membership_applications, registration_fees,
subscriptions, contributions, payment_verifications, audit_events.

Registration fees, subscriptions and savings contributions are separate
financial record types. Contributions start as ``Pending verification`` and
are not confirmed savings until a verification record marks them ``Verified``.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
    )
    op.create_index("ix_permissions_code", "permissions", ["code"], unique=False)
    op.create_index("ix_permissions_id", "permissions", ["id"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )
    op.create_index("ix_roles_id", "roles", ["id"], unique=False)
    op.create_index("ix_roles_name", "roles", ["name"], unique=False)

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_role_id", "users", ["role_id"], unique=False)

    op.create_table(
        "members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_number", sa.String(length=50), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_number", name="uq_members_member_number"),
        sa.UniqueConstraint("user_id", name="uq_members_user_id"),
    )
    op.create_index("ix_members_email", "members", ["email"], unique=False)
    op.create_index("ix_members_id", "members", ["id"], unique=False)
    op.create_index("ix_members_member_number", "members", ["member_number"], unique=False)
    op.create_index("ix_members_user_id", "members", ["user_id"], unique=False)

    op.create_table(
        "savings_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_savings_plans_name"),
    )
    op.create_index("ix_savings_plans_id", "savings_plans", ["id"], unique=False)
    op.create_index("ix_savings_plans_name", "savings_plans", ["name"], unique=False)

    op.create_table(
        "member_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["savings_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "plan_id", name="uq_member_plan"),
    )
    op.create_index("ix_member_plans_id", "member_plans", ["id"], unique=False)
    op.create_index("ix_member_plans_member_id", "member_plans", ["member_id"], unique=False)
    op.create_index("ix_member_plans_plan_id", "member_plans", ["plan_id"], unique=False)

    op.create_table(
        "consent_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("consent_type", sa.String(length=100), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_consent_records_consent_type", "consent_records", ["consent_type"], unique=False)
    op.create_index("ix_consent_records_id", "consent_records", ["id"], unique=False)
    op.create_index("ix_consent_records_member_id", "consent_records", ["member_id"], unique=False)

    op.create_table(
        "membership_applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_number", sa.String(length=50), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Submitted"),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("application_number", name="uq_membership_applications_application_number"),
    )
    op.create_index("ix_membership_applications_application_number", "membership_applications", ["application_number"], unique=False)
    op.create_index("ix_membership_applications_email", "membership_applications", ["email"], unique=False)
    op.create_index("ix_membership_applications_id", "membership_applications", ["id"], unique=False)
    op.create_index("ix_membership_applications_member_id", "membership_applications", ["member_id"], unique=False)
    op.create_index("ix_membership_applications_status", "membership_applications", ["status"], unique=False)

    op.create_table(
        "registration_fees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fee_reference", sa.String(length=50), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="USD", nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fee_reference", name="uq_registration_fees_fee_reference"),
    )
    op.create_index("ix_registration_fees_fee_reference", "registration_fees", ["fee_reference"], unique=False)
    op.create_index("ix_registration_fees_id", "registration_fees", ["id"], unique=False)
    op.create_index("ix_registration_fees_member_id", "registration_fees", ["member_id"], unique=False)
    op.create_index("ix_registration_fees_status", "registration_fees", ["status"], unique=False)

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subscription_reference", sa.String(length=50), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.String(length=7), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="USD", nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Pending"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "period_month", name="uq_member_subscription_month"),
        sa.UniqueConstraint("subscription_reference", name="uq_subscriptions_subscription_reference"),
    )
    op.create_index("ix_subscriptions_id", "subscriptions", ["id"], unique=False)
    op.create_index("ix_subscriptions_member_id", "subscriptions", ["member_id"], unique=False)
    op.create_index("ix_subscriptions_period_month", "subscriptions", ["period_month"], unique=False)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"], unique=False)
    op.create_index("ix_subscriptions_subscription_reference", "subscriptions", ["subscription_reference"], unique=False)

    op.create_table(
        "contributions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contribution_reference", sa.String(length=50), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="USD", nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Pending verification"),
        sa.Column("recorded_by", sa.Integer(), nullable=True),
        sa.Column("verified_by", sa.Integer(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_date", sa.Date(), nullable=True),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["savings_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contribution_reference", name="uq_contributions_contribution_reference"),
    )
    op.create_index("ix_contributions_contribution_reference", "contributions", ["contribution_reference"], unique=False)
    op.create_index("ix_contributions_id", "contributions", ["id"], unique=False)
    op.create_index("ix_contributions_member_id", "contributions", ["member_id"], unique=False)
    op.create_index("ix_contributions_plan_id", "contributions", ["plan_id"], unique=False)
    op.create_index("ix_contributions_status", "contributions", ["status"], unique=False)

    op.create_table(
        "payment_verifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("verification_reference", sa.String(length=50), nullable=False),
        sa.Column("contribution_id", sa.Integer(), nullable=True),
        sa.Column("subscription_id", sa.Integer(), nullable=True),
        sa.Column("registration_fee_id", sa.Integer(), nullable=True),
        sa.Column("verified_by", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Verified"),
        sa.Column("verified_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["contribution_id"], ["contributions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["registration_fee_id"], ["registration_fees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("verification_reference", name="uq_payment_verifications_verification_reference"),
    )
    op.create_index("ix_payment_verifications_contribution_id", "payment_verifications", ["contribution_id"], unique=False)
    op.create_index("ix_payment_verifications_id", "payment_verifications", ["id"], unique=False)
    op.create_index("ix_payment_verifications_registration_fee_id", "payment_verifications", ["registration_fee_id"], unique=False)
    op.create_index("ix_payment_verifications_status", "payment_verifications", ["status"], unique=False)
    op.create_index("ix_payment_verifications_subscription_id", "payment_verifications", ["subscription_id"], unique=False)
    op.create_index("ix_payment_verifications_verification_reference", "payment_verifications", ["verification_reference"], unique=False)
    op.create_index("ix_payment_verifications_verified_by", "payment_verifications", ["verified_by"], unique=False)

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("target_table", sa.String(length=100), nullable=True),
        sa.Column("target_id", sa.String(length=100), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"], unique=False)
    op.create_index("ix_audit_events_id", "audit_events", ["id"], unique=False)
    op.create_index("ix_audit_events_target_id", "audit_events", ["target_id"], unique=False)
    op.create_index("ix_audit_events_target_table", "audit_events", ["target_table"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_events_target_table", table_name="audit_events")
    op.drop_index("ix_audit_events_target_id", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_id", table_name="audit_events")
    op.drop_table("audit_events")

    op.drop_index("ix_payment_verifications_verified_by", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_verification_reference", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_subscription_id", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_status", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_registration_fee_id", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_id", table_name="payment_verifications")
    op.drop_index("ix_payment_verifications_contribution_id", table_name="payment_verifications")
    op.drop_table("payment_verifications")

    op.drop_index("ix_contributions_status", table_name="contributions")
    op.drop_index("ix_contributions_plan_id", table_name="contributions")
    op.drop_index("ix_contributions_member_id", table_name="contributions")
    op.drop_index("ix_contributions_id", table_name="contributions")
    op.drop_index("ix_contributions_contribution_reference", table_name="contributions")
    op.drop_table("contributions")

    op.drop_index("ix_subscriptions_subscription_reference", table_name="subscriptions")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_period_month", table_name="subscriptions")
    op.drop_index("ix_subscriptions_member_id", table_name="subscriptions")
    op.drop_index("ix_subscriptions_id", table_name="subscriptions")
    op.drop_table("subscriptions")

    op.drop_index("ix_registration_fees_status", table_name="registration_fees")
    op.drop_index("ix_registration_fees_member_id", table_name="registration_fees")
    op.drop_index("ix_registration_fees_id", table_name="registration_fees")
    op.drop_index("ix_registration_fees_fee_reference", table_name="registration_fees")
    op.drop_table("registration_fees")

    op.drop_index("ix_membership_applications_status", table_name="membership_applications")
    op.drop_index("ix_membership_applications_member_id", table_name="membership_applications")
    op.drop_index("ix_membership_applications_id", table_name="membership_applications")
    op.drop_index("ix_membership_applications_email", table_name="membership_applications")
    op.drop_index("ix_membership_applications_application_number", table_name="membership_applications")
    op.drop_table("membership_applications")

    op.drop_index("ix_consent_records_member_id", table_name="consent_records")
    op.drop_index("ix_consent_records_id", table_name="consent_records")
    op.drop_index("ix_consent_records_consent_type", table_name="consent_records")
    op.drop_table("consent_records")

    op.drop_index("ix_member_plans_plan_id", table_name="member_plans")
    op.drop_index("ix_member_plans_member_id", table_name="member_plans")
    op.drop_index("ix_member_plans_id", table_name="member_plans")
    op.drop_table("member_plans")

    op.drop_index("ix_savings_plans_name", table_name="savings_plans")
    op.drop_index("ix_savings_plans_id", table_name="savings_plans")
    op.drop_table("savings_plans")

    op.drop_index("ix_members_user_id", table_name="members")
    op.drop_index("ix_members_member_number", table_name="members")
    op.drop_index("ix_members_id", table_name="members")
    op.drop_index("ix_members_email", table_name="members")
    op.drop_table("members")

    op.drop_index("ix_users_role_id", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.drop_table("role_permissions")

    op.drop_index("ix_roles_name", table_name="roles")
    op.drop_index("ix_roles_id", table_name="roles")
    op.drop_table("roles")

    op.drop_index("ix_permissions_code", table_name="permissions")
    op.drop_index("ix_permissions_id", table_name="permissions")
    op.drop_table("permissions")
