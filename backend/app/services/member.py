"""Member business services."""
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.exceptions import conflict, not_found
from app.models.contribution import Contribution
from app.models.member import Member
from app.models.member_plan import MemberPlan
from app.schemas.member import MemberCreate, MemberUpdate


def create_member(db: Session, member_in: MemberCreate) -> Member:
    existing = db.query(Member).filter(Member.member_number == member_in.member_number).first()
    if existing:
        raise conflict("Member number already exists", {"member_number": member_in.member_number})
    member = Member(**member_in.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def get_member(db: Session, member_id: int) -> Member | None:
    return db.query(Member).filter(Member.id == member_id).first()


def get_member_by_number(db: Session, member_number: str) -> Member | None:
    return db.query(Member).filter(Member.member_number == member_number).first()


def list_members(db: Session, skip: int = 0, limit: int = 100) -> list[Member]:
    return db.query(Member).offset(skip).limit(limit).all()


def search_members(query, search: str):
    """Literal, case-insensitive substring search; SQL binds/escapes user input."""
    value = search.strip()
    if not value:
        return query
    fields = (Member.member_number, Member.first_name, Member.last_name,
              Member.first_name + " " + Member.last_name, Member.email, Member.phone)
    return query.filter(or_(*(field.icontains(value, autoescape=True) for field in fields)))


def update_member(db: Session, member_id: int, member_in: MemberUpdate) -> Member | None:
    member = get_member(db, member_id)
    if not member:
        return None
    data = member_in.model_dump(exclude_unset=True)
    if "member_number" in data and data["member_number"] != member.member_number:
        existing = get_member_by_number(db, data["member_number"])
        if existing and existing.id != member_id:
            raise conflict("Member number already exists", {"member_number": data["member_number"]})
    for field, value in data.items():
        setattr(member, field, value)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def delete_member(db: Session, member_id: int) -> bool:
    member = get_member(db, member_id)
    if not member:
        return False
    db.delete(member)
    db.commit()
    return True


def confirmed_savings_total(db: Session, member_id: int) -> Decimal:
    """Compatibility helper: USD ledger only; never mix currencies or legacy rows."""
    from app.models.savings import SavingsLedgerEntry
    rows=db.query(SavingsLedgerEntry.amount).filter_by(member_id=member_id,currency='USD').all()
    return sum((r[0] for r in rows),Decimal('0'))


def enrol_in_plan(db: Session, member_id: int, plan_id: int) -> MemberPlan:
    from app.models.savings_plan import SavingsPlan

    member = get_member(db, member_id)
    if not member:
        raise not_found("Member not found", {"member_id": member_id})
    plan = db.query(SavingsPlan).filter(SavingsPlan.id == plan_id).first()
    if not plan:
        raise not_found("Savings plan not found", {"plan_id": plan_id})
    existing = (
        db.query(MemberPlan)
        .filter(MemberPlan.member_id == member_id, MemberPlan.plan_id == plan_id)
        .first()
    )
    if existing:
        raise conflict("Member already enrolled in this plan", {"member_id": member_id, "plan_id": plan_id})
    enrolment = MemberPlan(member_id=member_id, plan_id=plan_id)
    db.add(enrolment)
    db.commit()
    db.refresh(enrolment)
    return enrolment
