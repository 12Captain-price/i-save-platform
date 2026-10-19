"""User account business services."""
from typing import Optional

from sqlalchemy.orm import Session

from app.exceptions import conflict, not_found
from app.models.user import User
from app.security.hashing import hash_password
from app.schemas.user import UserCreate, UserUpdate


def create_user(db: Session, user_in: UserCreate) -> User:
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise conflict("Email already registered", {"email": user_in.email})
    user = User(
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        role_id=user_in.role_id,
        is_active=user_in.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def list_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return db.query(User).offset(skip).limit(limit).all()


def update_user(db: Session, user_id: int, user_in: UserUpdate) -> Optional[User]:
    user = get_user(db, user_id)
    if not user:
        return None
    data = user_in.model_dump(exclude_unset=True)
    if "email" in data and data["email"] != user.email:
        existing = get_user_by_email(db, data["email"])
        if existing and existing.id != user_id:
            raise conflict("Email already registered", {"email": data["email"]})
    if "password" in data:
        data["password_hash"] = hash_password(data.pop("password"))
    for field, value in data.items():
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, user_id: int) -> bool:
    user = get_user(db, user_id)
    if not user:
        return False
    user.is_active = False
    db.add(user)
    db.commit()
    return True
