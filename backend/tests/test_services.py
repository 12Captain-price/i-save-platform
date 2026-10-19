"""Tests for the initial business services."""
from decimal import Decimal

from app.schemas.contribution import ContributionCreate
from app.schemas.member import MemberCreate
from app.schemas.user import UserCreate
from app.services.application import create_application, decide_application
from app.services.contribution import (
    confirmed_savings_total,
    create_contribution,
    reverse_contribution,
    verify_contribution,
)
from app.services.member import create_member
from app.services.user import create_user


def test_create_member(db):
    member = create_member(
        db,
        MemberCreate(
            member_number="IS-1042",
            first_name="Tariro",
            last_name="Moyo",
            email="tariro@example.com",
        ),
    )
    assert member.id is not None
    assert member.member_number == "IS-1042"
    assert member.full_name == "Tariro Moyo"


def test_duplicate_member_number_rejected(db):
    create_member(db, MemberCreate(member_number="IS-1042", first_name="A", last_name="B"))
    try:
        create_member(db, MemberCreate(member_number="IS-1042", first_name="C", last_name="D"))
    except Exception as exc:
        assert exc.status_code == 409
    else:  # pragma: no cover - should have raised
        raise AssertionError("Expected a conflict for duplicate member number")


def test_pending_contribution_is_not_confirmed_savings(db):
    member = create_member(db, MemberCreate(member_number="IS-1042", first_name="Tariro", last_name="Moyo"))
    recorder = create_user(db, UserCreate(email="recorder@example.test", password="recorderpass123"))
    contribution = create_contribution(
        db,
        ContributionCreate(
            contribution_reference="TX-2086",
            member_id=member.id,
            amount=Decimal("150.00"),
        ),
        recorded_by=recorder.id,
    )
    assert contribution.status == "Pending verification"
    # Pending contributions are NOT confirmed savings.
    assert confirmed_savings_total(db, member.id) == Decimal("0")


def test_verified_contribution_is_confirmed_savings(db):
    member = create_member(db, MemberCreate(member_number="IS-1043", first_name="Nyasha", last_name="Dube"))
    # A verifying user must exist for the verification step.
    verifier = create_user(db, UserCreate(email="verifier@example.com", password="verifypass123", role_id=None))

    contribution = create_contribution(
        db,
        ContributionCreate(
            contribution_reference="TX-2087",
            member_id=member.id,
            amount=Decimal("80.00"),
        ),
        recorded_by=verifier.id,
    )
    verified = verify_contribution(db, contribution.id, verified_by=verifier.id, note="Office receipt reviewed.")
    assert verified.status == "Verified"
    # Only verified contributions count as confirmed savings.
    assert confirmed_savings_total(db, member.id) == Decimal("80.00")


def test_reversed_contribution_not_counted(db):
    member = create_member(db, MemberCreate(member_number="IS-1044", first_name="Kudzai", last_name="Ncube"))
    verifier = create_user(db, UserCreate(email="verifier2@example.com", password="verifypass123", role_id=None))
    contribution = create_contribution(
        db,
        ContributionCreate(
            contribution_reference="TX-2088",
            member_id=member.id,
            amount=Decimal("60.00"),
        ),
        recorded_by=verifier.id,
    )
    verify_contribution(db, contribution.id, verified_by=verifier.id)
    reversed_contribution = reverse_contribution(db, contribution.id, note="Reversed in error.")
    assert reversed_contribution.status == "Reversed"
    assert confirmed_savings_total(db, member.id) == Decimal("0")


def test_application_decision_transitions_status(db):
    member = create_member(db, MemberCreate(member_number="IS-1045", first_name="Rudo", last_name="Chirwa"))
    reviewer = create_user(db, UserCreate(email="reviewer@example.com", password="reviewerpass123", role_id=None))
    application = create_application(
        db,
        __import__("app.schemas.application", fromlist=["ApplicationCreate"]).ApplicationCreate(
            application_number="APP-031",
            member_id=member.id,
            first_name="Rudo",
            last_name="Chirwa",
            email="rudo@example.com",
            reason="Education savings.",
        ),
    )
    assert application.status == "Submitted"

    decided = decide_application(
        db,
        application.id,
        status="Approved",
        reviewer_id=reviewer.id,
    )
    assert decided.status == "Approved"
    assert decided.reviewed_by == reviewer.id
    assert decided.reviewed_at is not None
