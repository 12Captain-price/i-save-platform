"""Pytest fixtures for the backend test suite.

Tests default to a dedicated SQLite file database (``./data/test_i_save.db``).
ISAVE_TEST_DATABASE_URL may select an isolated isave_test_* PostgreSQL database.
Each test uses savepoints inside a transaction that is rolled back afterwards.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_db
from app.main import app as fastapi_app

# Import every model so Base.metadata is fully populated before create_all.
import app.models  # noqa: F401

os.makedirs("./data", exist_ok=True)

TEST_DB_URL = os.environ.get("ISAVE_TEST_DATABASE_URL", "sqlite:///./data/test_i_save.db")
if not TEST_DB_URL.startswith("sqlite") and not (make_url(TEST_DB_URL).database or "").startswith("isave_test_"):
    raise RuntimeError("The test database must have an isave_test_ prefix on an isolated development server")

test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False} if TEST_DB_URL.startswith("sqlite") else {})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create all tables once for the test session."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture
def db(setup_test_db) -> Session:
    """Provide a transactional session rolled back after each test."""
    connection = test_engine.connect()
    transaction = connection.begin()
    # sqlite3 otherwise defers BEGIN until a write; SAVEPOINT would become
    # the outer transaction and releasing it could leak rows between tests.
    if test_engine.dialect.name == "sqlite":
        connection.exec_driver_sql("BEGIN")
    session = TestingSessionLocal(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """Provide a TestClient whose ``get_db`` dependency uses the test session."""

    def override_get_db():
        yield db

    fastapi_app.dependency_overrides[get_db] = override_get_db
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()
