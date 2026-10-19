"""Tests for database setup and session management."""
from sqlalchemy import text

from app.database import Base


def test_engine_executes_query(db):
    result = db.execute(text("SELECT 1")).scalar()
    assert result == 1


def test_session_is_bound(db):
    assert db.get_bind() is not None


def test_metadata_defines_core_tables():
    expected = {
        "roles",
        "permissions",
        "role_permissions",
        "users",
        "members",
        "savings_plans",
        "member_plans",
        "consent_records",
        "membership_applications",
        "registration_fees",
        "subscriptions",
        "contributions",
        "payment_verifications",
        "audit_events",
    }
    assert expected <= set(Base.metadata.tables.keys())
