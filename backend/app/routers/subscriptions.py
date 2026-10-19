"""Monthly subscription API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import not_found
from app.models.subscription import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionRead, SubscriptionUpdate
from app.services import subscription as subscription_service

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


@router.post("", response_model=SubscriptionRead, status_code=201)
def create_subscription(
    subscription_in: SubscriptionCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    return subscription_service.create_subscription(db, subscription_in)


@router.get("", response_model=list[SubscriptionRead])
def list_subscriptions(
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Subscription]:
    return subscription_service.list_subscriptions(db, skip=skip, limit=limit)


@router.get("/{subscription_id}", response_model=SubscriptionRead)
def get_subscription(
    subscription_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    subscription = subscription_service.get_subscription(db, subscription_id)
    if not subscription:
        raise not_found("Subscription not found", {"subscription_id": subscription_id})
    return subscription


@router.patch("/{subscription_id}/paid", response_model=SubscriptionRead)
def mark_subscription_paid(
    subscription_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    subscription = subscription_service.mark_subscription_paid(db, subscription_id)
    if not subscription:
        raise not_found("Subscription not found", {"subscription_id": subscription_id})
    return subscription
