"""Read-only organisation counts with explicit resource permissions."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.member import Member
from app.models.user import User
from app.security.auth import require

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class OrganisationOverview(BaseModel):
    member_count: int
    linked_member_count: int
    unlinked_member_count: int
    account_count: int


@router.get("/overview", response_model=OrganisationOverview,
            dependencies=[Depends(require("members:read")), Depends(require("users:read"))])
def overview(db: Session = Depends(get_db)):
    # All counts come from one database statement/snapshot, not page lengths.
    members = select(func.count()).select_from(Member).scalar_subquery()
    linked = select(func.count()).select_from(Member).where(Member.user_id.is_not(None)).scalar_subquery()
    accounts = select(func.count()).select_from(User).scalar_subquery()
    total, linked_total, account_total = db.execute(select(members, linked, accounts)).one()
    return {"member_count":total, "linked_member_count":linked_total,
            "unlinked_member_count":total-linked_total, "account_count":account_total}
