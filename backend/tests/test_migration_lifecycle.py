"""Real database lifecycle checks, including the former create_all deployment.

Set TEST_POSTGRES_URL to an isolated development PostgreSQL server URL to run
the same checks against temporary databases there. No existing DB is dropped.
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.database import Base
from app.migrations import baseline, require_current_schema, schema_differences, upgrade


@pytest.fixture(params=["sqlite", "postgresql"])
def migration_database(request, tmp_path):
    if request.param == "sqlite":
        database = create_engine(f"sqlite:///{tmp_path / 'lifecycle.db'}")
        yield database
        database.dispose()
        return
    postgres_url = os.environ.get("TEST_POSTGRES_URL")
    if not postgres_url:
        pytest.skip("TEST_POSTGRES_URL not configured")
    url = make_url(postgres_url)
    database_name = "isave_test_" + uuid.uuid4().hex
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{database_name}"'))
    database = create_engine(url.set(database=database_name))
    try:
        yield database
    finally:
        database.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{database_name}" WITH (FORCE)'))
        admin.dispose()


def create_legacy_schema(database):
    from sqlalchemy import MetaData

    original = MetaData()
    for table in Base.metadata.sorted_tables:
        if table.name in {"auth_sessions", "user_permissions", "login_throttles"}:
            continue
        table.to_metadata(original)
    for name in ("created_at", "updated_at"):
        original.tables["member_plans"]._columns.remove(original.tables["member_plans"].columns[name])
    original.create_all(database)


def test_fresh_upgrade_repeat_and_constraints(migration_database):
    database = migration_database
    upgrade(database)
    upgrade(database)
    require_current_schema(database)
    assert set(inspect(database).get_table_names()) == set(Base.metadata.tables) | {"alembic_version"}
    with database.connect() as connection:
        assert schema_differences(connection) == []
    with database.begin() as connection:
        connection.execute(text("INSERT INTO users (email) VALUES ('migration@example.test')"))
        assert connection.execute(text("SELECT is_active FROM users")).scalar()
    with pytest.raises(IntegrityError), database.begin() as connection:
        connection.execute(text("INSERT INTO users (email) VALUES ('migration@example.test')"))
    if database.dialect.name == "postgresql":
        with pytest.raises(IntegrityError), database.begin() as connection:
            connection.execute(text("INSERT INTO users (email, role_id) VALUES ('fk@example.test', 99999)"))


def test_legacy_adoption_is_explicit_and_preserves_rows(migration_database):
    database = migration_database
    create_legacy_schema(database)
    with database.begin() as connection:
        connection.execute(Base.metadata.tables["roles"].insert().values(name="Historical role"))
        connection.execute(Base.metadata.tables["members"].insert().values(
            member_number="LEGACY-1", first_name="Synthetic", last_name="Member"))
        connection.execute(Base.metadata.tables["savings_plans"].insert().values(name="Synthetic plan"))
        connection.execute(text("INSERT INTO member_plans (member_id,plan_id,is_active) VALUES (1,1,true)"))
    with pytest.raises(RuntimeError, match="untracked"):
        upgrade(database)
    baseline(database)
    assert "alembic_version" not in inspect(database).get_table_names()
    baseline(database, apply=True)
    upgrade(database)
    require_current_schema(database)
    with database.connect() as connection:
        assert connection.execute(text("SELECT name FROM roles")).scalar() == "Historical role"
        assert connection.execute(text("SELECT created_at FROM member_plans")).scalar() is not None
        assert schema_differences(connection) == []
    with pytest.raises(RuntimeError, match="already has"):
        baseline(database, apply=True)


@pytest.mark.parametrize("drift", ["missing_table", "extra_table", "missing_unique", "partial_unique", "extra_column", "bad_default"])
def test_baseline_refuses_drift_without_stamping(migration_database, drift):
    database = migration_database
    create_legacy_schema(database)
    with database.begin() as connection:
        if drift == "missing_table":
            Base.metadata.tables["audit_events"].drop(connection)
        elif drift == "extra_table":
            connection.execute(text("CREATE TABLE unexpected (id INTEGER PRIMARY KEY)"))
        elif drift == "missing_unique":
            connection.execute(text("DROP INDEX ix_users_email"))
        elif drift == "partial_unique":
            connection.execute(text("DROP INDEX ix_users_email"))
            connection.execute(text("CREATE UNIQUE INDEX ix_users_email ON users(email) WHERE is_active = true"))
        elif drift == "extra_column":
            connection.execute(text("ALTER TABLE users ADD COLUMN unexpected INTEGER"))
        elif database.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE contributions ALTER COLUMN status SET DEFAULT 'Verified'"))
        else:
            connection.execute(text("ALTER TABLE users ADD COLUMN unexpected INTEGER DEFAULT 100"))
    with pytest.raises(RuntimeError, match="Baseline refused"):
        baseline(database, apply=True)
    assert "alembic_version" not in inspect(database).get_table_names()


def test_api_startup_does_not_create_or_adopt_tables(migration_database, monkeypatch):
    import app.main as main
    import app.routers.health as health

    database = migration_database
    monkeypatch.setattr(main, "engine", database)
    monkeypatch.setattr(health, "engine", database)
    assert TestClient(main.app).get("/ready").status_code == 503
    with pytest.raises(RuntimeError, match="required Alembic revision"):
        with TestClient(main.app):
            pass
    assert inspect(database).get_table_names() == []
    create_legacy_schema(database)
    with pytest.raises(RuntimeError, match="required Alembic revision"):
        with TestClient(main.app):
            pass
    assert "alembic_version" not in inspect(database).get_table_names()
    baseline(database, apply=True)
    upgrade(database)
    with TestClient(main.app) as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/ready").json()["status"] == "ok"
        with database.begin() as connection:
            connection.execute(text("DELETE FROM alembic_version"))
        assert client.get("/ready").status_code == 503


def test_stamped_database_with_schema_drift_refuses_startup(migration_database):
    database = migration_database
    upgrade(database)
    with database.begin() as connection:
        connection.execute(text("DROP INDEX ix_users_email"))
    with pytest.raises(RuntimeError, match="schema differs"):
        require_current_schema(database)


def test_missing_history_on_a_different_schema_is_not_assumed_legacy(migration_database):
    database = migration_database
    upgrade(database)
    with database.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
    # The original migration has extra member_plans timestamps absent from
    # create_all. Lost history needs recovery/review, never a guessed baseline.
    with pytest.raises(RuntimeError, match="Baseline refused"):
        baseline(database, apply=True)
    assert "alembic_version" not in inspect(database).get_table_names()


def test_auth_upgrade_preserves_existing_accounts_and_bootstrap_is_one_time(migration_database):
    from sqlalchemy.orm import Session
    from app.bootstrap import bootstrap
    from app.exceptions import APIError
    from app.migrations import migration_config
    from alembic import command
    from app.models.user import User
    from app.models.role import Role
    from app.security.hashing import verify_password
    from app.services.auth import login, revoke_all
    from app.models.auth import AuthSession
    from app.security.auth import digest

    database = migration_database
    with database.connect() as connection:
        command.upgrade(migration_config(connection), "0002_enrolment_timestamps")
    with database.begin() as connection:
        connection.execute(text("INSERT INTO users (email, password_hash) VALUES ('historical@example.test', 'historical-hash')"))
    upgrade(database)
    upgrade(database)
    with Session(database) as db:
        historical = db.query(User).filter_by(email="historical@example.test").one()
        assert historical.password_hash == "historical-hash"
        admin = bootstrap(db, "initial-admin@example.test", "Synthetic-admin-123!")
        assert verify_password("Synthetic-admin-123!", admin.password_hash)
        assert admin.role.name == "administrator"
        with pytest.raises(APIError):
            bootstrap(db, "another@example.test", "Synthetic-admin-123!")
        db.rollback()
        assert db.query(User).count() == 2
        token, _ = login(db, "INITIAL-ADMIN@example.test", "Synthetic-admin-123!", "127.0.0.1")
        assert db.get(AuthSession, digest(token)).user_id == admin.id
        revoke_all(db, admin.id)
        db.commit()
        assert db.get(AuthSession, digest(token)).revoked_at is not None
    require_current_schema(database)


def test_concurrent_admin_changes_preserve_an_active_admin(migration_database):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    from app.bootstrap import bootstrap
    from app.models.user import User
    from app.services.access import update_user
    from app.schemas.user import UserUpdate
    from app.exceptions import APIError

    database = migration_database
    upgrade(database)
    with Session(database) as db:
        first = bootstrap(db, "first@example.test", "Synthetic-admin-123!")
        second = User(email="second@example.test", role_id=first.role_id, is_active=True)
        db.add(second)
        db.commit()
        ids = first.id, second.id
    barrier = Barrier(2)
    def deactivate(actor_id, target_id):
        with Session(database) as db:
            actor = db.get(User, actor_id)
            barrier.wait(timeout=10)
            try:
                update_user(db, actor, target_id, UserUpdate(is_active=False))
                return 200
            except APIError as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(deactivate, ids[0], ids[1]), executor.submit(deactivate, ids[1], ids[0])]
        outcomes = sorted(f.result(timeout=20) for f in futures)
    assert outcomes == [200, 403]
    with Session(database) as db:
        assert db.query(User).filter(User.is_active.is_(True)).count() == 1
