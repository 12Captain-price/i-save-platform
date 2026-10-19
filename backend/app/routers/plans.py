"""Savings plan API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.savings_plan import SavingsPlan
from app.schemas.savings_plan import SavingsPlanCreate, SavingsPlanRead, SavingsPlanUpdate
from app.services import plan as plan_service

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])


@router.post("", response_model=SavingsPlanRead, status_code=201)
def create_plan(
    plan_in: SavingsPlanCreate,
    db: Annotated[Session, Depends(get_db)],
) -> SavingsPlan:
    return plan_service.create_plan(db, plan_in)


@router.get("", response_model=list[SavingsPlanRead])
def list_plans(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[SavingsPlan]:
    return plan_service.list_plans(db, skip=skip, limit=limit)


@router.get("/{plan_id}", response_model=SavingsPlanRead)
def get_plan(
    plan_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> SavingsPlan:
    plan = plan_service.get_plan(db, plan_id)
    if not plan:
        raise not_found("Savings plan not found", {"plan_id": plan_id})
    return plan


@router.patch("/{plan_id}", response_model=SavingsPlanRead)
def update_plan(
    plan_id: Annotated[int, Path(gt=0)],
    plan_in: SavingsPlanUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> SavingsPlan:
    plan = plan_service.update_plan(db, plan_id, plan_in)
    if not plan:
        raise not_found("Savings plan not found", {"plan_id": plan_id})
    return plan
