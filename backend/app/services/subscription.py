"""Monthly subscription business services."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.member import Member
from app.models.subscription import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate


def create_subscription(db: Session, subscription_in: SubscriptionCreate) -> Subscription:
    member = db.query(Member).filter(Member.id == subscription_in.member_id).first()
    if not member:
        raise not_found("Member not found", {"member_id": subscription_in.member_id})
    existing = (
        db.query(Subscription)
        .filter(
            Subscription.member_id == subscription_in.member_id,
            Subscription.period_month == subscription_in.period_month,
        )
        .first()
    )
    if existing:
        raise conflict(
            "Subscription already exists for this member and month",
            {"member_id": subscription_in.member_id, "period_month": subscription_in.period_month},
        )
    subscription = Subscription(**subscription_in.model_dump())
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def get_subscription(db: Session, subscription_id: int) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.id == subscription_id).first()


def list_subscriptions(db: Session, skip: int = 0, limit: int = 100) -> list[Subscription]:
    return db.query(Subscription).offset(skip).limit(limit).all()


def mark_subscription_paid(db: Session, subscription_id: int) -> Optional[Subscription]:
    subscription = get_subscription(db, subscription_id)
    if not subscription:
        return None
    subscription.status = "Paid"
    subscription.paid_at = datetime.utcnow()
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription
