"""Pytest fixtures for the backend test suite.

Tests run against a dedicated SQLite file database (``./data/test_i_save.db``)
so no PostgreSQL instance is required locally. Each test runs inside a
transaction that is rolled back afterwards, keeping tests isolated.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_db
from app.main import app

# Import every model so Base.metadata is fully populated before create_all.
import app.models  # noqa: F401

os.makedirs("./data", exist_ok=True)

TEST_DB_URL = "sqlite:///./data/test_i_save.db"

test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
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
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """Provide a TestClient whose ``get_db`` dependency uses the test session."""

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
