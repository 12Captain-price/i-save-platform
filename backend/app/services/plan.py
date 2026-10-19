"""Savings plan business services."""
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.savings_plan import SavingsPlan
from app.schemas.savings_plan import SavingsPlanCreate, SavingsPlanUpdate


def create_plan(db: Session, plan_in: SavingsPlanCreate) -> SavingsPlan:
    existing = db.query(SavingsPlan).filter(SavingsPlan.name == plan_in.name).first()
    if existing:
        raise conflict("Plan already exists", {"name": plan_in.name})
    plan = SavingsPlan(**plan_in.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def get_plan(db: Session, plan_id: int) -> SavingsPlan | None:
    return db.query(SavingsPlan).filter(SavingsPlan.id == plan_id).first()


def get_plan_by_name(db: Session, name: str) -> SavingsPlan | None:
    return db.query(SavingsPlan).filter(SavingsPlan.name == name).first()


def list_plans(db: Session, skip: int = 0, limit: int = 100) -> list[SavingsPlan]:
    return db.query(SavingsPlan).offset(skip).limit(limit).all()


def update_plan(db: Session, plan_id: int, plan_in: SavingsPlanUpdate) -> Optional[SavingsPlan]:
    plan = get_plan(db, plan_id)
    if not plan:
        return None
    data = plan_in.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != plan.name:
        existing = get_plan_by_name(db, data["name"])
        if existing and existing.id != plan_id:
            raise conflict("Plan already exists", {"name": data["name"]})
    for field, value in data.items():
        setattr(plan, field, value)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
