"""Tests for the initial schema: columns, defaults and constraints."""
from decimal import Decimal

from sqlalchemy import inspect

from app.models.contribution import Contribution
from app.schemas.member import MemberCreate
from app.services.member import create_member


def test_members_table_columns_and_constraints(db):
    bind = db.get_bind()
    inspector = inspect(bind)

    columns = {column["name"] for column in inspector.get_columns("members")}
    assert {
        "id",
        "member_number",
        "user_id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "address",
        "joined_at",
        "created_at",
        "updated_at",
    } <= columns

    # member_number is unique: reflected as a unique index on SQLite.
    indexes = inspector.get_indexes("members")
    assert any(
        index["unique"] and index["column_names"] == ["member_number"]
        for index in indexes
    )


def test_contribution_status_defaults_to_pending_verification(db):
    """A new contribution defaults to ``Pending verification`` (not confirmed)."""
    member = create_member(
        db, MemberCreate(member_number="IS-1042", first_name="Tariro", last_name="Moyo")
    )
    contribution = Contribution(
        contribution_reference="TX-DEFAULT",
        member_id=member.id,
        amount=Decimal("10.00"),
    )
    db.add(contribution)
    db.flush()
    assert contribution.status == "Pending verification"


def test_unique_constraints_exist(db):
    bind = db.get_bind()
    inspector = inspect(bind)

    # members.member_number unique (reflected as a unique index on SQLite).
    member_indexes = inspector.get_indexes("members")
    assert any(
        index["unique"] and index["column_names"] == ["member_number"]
        for index in member_indexes
    )

    # users.email unique (reflected as a unique index on SQLite).
    user_indexes = inspector.get_indexes("users")
    assert any(
        index["unique"] and index["column_names"] == ["email"] for index in user_indexes
    )

    # subscriptions: one row per member per month (table-level unique constraint).
    sub_constraints = inspector.get_unique_constraints("subscriptions")
    assert any(
        set(c["column_names"]) == {"member_id", "period_month"}
        for c in sub_constraints
    )

    # contributions.reference number unique (reflected as a unique index).
    contrib_indexes = inspector.get_indexes("contributions")
    assert any(
        index["unique"]
        and index["column_names"] == ["contribution_reference"]
        for index in contrib_indexes
    )
