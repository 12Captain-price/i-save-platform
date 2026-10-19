"""Database connection and session management.

The backend targets PostgreSQL for staging via ``DATABASE_URL``. For local
development (where no PostgreSQL instance is installed) a SQLite file
database is used. This is explicit and configurable -- never a silent
substitution of an incompatible database.
"""
from datetime import datetime

from sqlalchemy import DateTime, create_engine, func
from sqlalchemy.orm import declarative_base, mapped_column, Mapped, sessionmaker

from app.config import get_settings

settings = get_settings()

connect_args = {}
if settings.database_url.startswith("sqlite"):
    # SQLite requires check_same_thread=False for use across request threads.
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class TimestampMixin:
    """Automatic created_at/updated_at timestamps on every entity."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def get_db():
    """Yield a SQLAlchemy session and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
