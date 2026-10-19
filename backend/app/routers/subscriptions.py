"""Monthly subscription API router."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.auth import resource_access, current_user, scoped_query, check_owned, unconfigured
from app.models.user import User as Actor
from app.exceptions import not_found
from app.models.subscription import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionRead, SubscriptionUpdate
from app.services import subscription as subscription_service

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"], dependencies=[Depends(resource_access("subscriptions"))])


@router.post("", response_model=SubscriptionRead, status_code=201, dependencies=[Depends(unconfigured)])
def create_subscription(
    subscription_in: SubscriptionCreate,
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    return subscription_service.create_subscription(db, subscription_in)


@router.get("", response_model=list[SubscriptionRead])
def list_subscriptions(
    actor: Annotated[Actor, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[Subscription]:
    return scoped_query(db, Subscription, actor, "subscriptions").order_by(Subscription.id).offset(skip).limit(limit).all()


@router.get("/{subscription_id}", response_model=SubscriptionRead)
def get_subscription(
    actor: Annotated[Actor, Depends(current_user)],
    subscription_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    subscription = scoped_query(db, Subscription, actor, "subscriptions").filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise not_found("Subscription not found", {"subscription_id": subscription_id})
    return subscription


@router.patch("/{subscription_id}/paid", response_model=SubscriptionRead, dependencies=[Depends(unconfigured)])
def mark_subscription_paid(
    subscription_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
) -> Subscription:
    subscription = subscription_service.mark_subscription_paid(db, subscription_id)
    if not subscription:
        raise not_found("Subscription not found", {"subscription_id": subscription_id})
    return subscription
