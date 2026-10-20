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
        if table.name in {"auth_sessions", "user_permissions", "login_throttles", "registration_submissions", "application_events", "savings_interests", "application_submissions", "application_registration_payments", "membership_approvals", "password_setup_invitations", "plan_drafts", "plan_draft_versions"}:
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


def test_registration_upgrade_preserves_legacy_and_records_snapshot(migration_database):
    from alembic import command
    from app.migrations import migration_config
    from sqlalchemy.orm import Session
    from app.models.application import MembershipApplication, ApplicationEvent
    database = migration_database
    with database.connect() as connection:
        command.upgrade(migration_config(connection), '0003_authentication')
    with Session(database) as db:
        record = MembershipApplication(application_number='LEGACY',first_name='Old',last_name='Record',email='old@example.test',status='Rejected',rejection_reason='Historical reason')
        db.add(record); db.commit()
        old = {col.name:getattr(record,col.name) for col in record.__table__.columns}
    upgrade(database); upgrade(database)
    require_current_schema(database)
    with Session(database) as db:
        record = db.query(MembershipApplication).one()
        assert {col.name:getattr(record,col.name) for col in record.__table__.columns} == old
        event = db.query(ApplicationEvent).one()
        assert event.status == 'Rejected' and 'earlier transitions are unavailable' in event.note
    with database.connect() as connection:
        command.downgrade(migration_config(connection), '0004_pending_registration')
    with pytest.raises(RuntimeError, match='history is retained'), database.connect() as connection:
        command.downgrade(migration_config(connection), '0003_authentication')
    upgrade(database)
    require_current_schema(database)


def test_concurrent_registration_creates_one_pending_application(migration_database):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import Session
    from starlette.requests import Request
    from app.routers.registration import register
    from app.schemas.application import PublicRegistration
    from app.models.application import MembershipApplication, ApplicationEvent
    database = migration_database
    upgrade(database)
    def submit():
        with Session(database) as db:
            return register(PublicRegistration(first_name='Concurrent',last_name='Synthetic',email='race@example.test'),
                Request({'type':'http','client':('127.0.0.1',1)}),db)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _:submit(),range(4)))
    assert all(result == results[0] for result in results)
    with Session(database) as db:
        assert db.query(MembershipApplication).count() == 1
        assert db.query(ApplicationEvent).count() == 1


def test_interest_migration_retains_registration_and_guards_history(migration_database):
    from app.migrations import migration_config
    from alembic import command
    from sqlalchemy.orm import Session
    from app.models.application import MembershipApplication, SavingsInterest
    from app.routers.registration import register
    from app.schemas.application import PublicRegistration
    from app.registration_options import OPTIONS
    from starlette.requests import Request
    database=migration_database
    with database.connect() as connection:
        command.upgrade(migration_config(connection),'0004_pending_registration')
    with Session(database) as db:
        original=MembershipApplication(application_number='PRE-INTEREST',first_name='Legacy',last_name='Synthetic',email='legacy-interest@example.test')
        db.add(original);db.commit()
        saved={col.name:getattr(original,col.name) for col in original.__table__.columns}
    upgrade(database);upgrade(database);require_current_schema(database)
    with Session(database) as db:
        original=db.query(MembershipApplication).one()
        assert {col.name:getattr(original,col.name) for col in original.__table__.columns}==saved
        assert db.query(SavingsInterest).count()==0
        register(PublicRegistration(first_name='Interest',last_name='Synthetic',email='new-interest@example.test',preferred_category='asset',interest_notice_version=OPTIONS['version']),Request({'type':'http','client':('127.0.0.1',1)}),db)
        assert db.query(SavingsInterest).count()==1
    with pytest.raises(RuntimeError,match='(interests|provenance).*retained'), database.connect() as connection:
        command.downgrade(migration_config(connection),'0004_pending_registration')
    require_current_schema(database)


def test_assisted_migration_preserves_rows_and_only_grants_administrator(migration_database):
    from alembic import command
    from app.migrations import migration_config
    from sqlalchemy.orm import Session
    from app.models.application import MembershipApplication,ApplicationSubmission
    database=migration_database
    with database.connect() as c:command.upgrade(migration_config(c),'0005_savings_interest')
    with database.begin() as c:
        c.execute(text("INSERT INTO roles(name) VALUES ('administrator'),('staff'),('member')"))
        c.execute(text("INSERT INTO permissions(code) VALUES ('existing:read')"))
        c.execute(text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p"))
        c.execute(text("INSERT INTO membership_applications(application_number,first_name,last_name,email,status) VALUES ('PRE-ASSIST','Legacy','Synthetic','legacy-assist@example.test','Pending')"))
        before=c.execute(text('SELECT * FROM membership_applications')).all()
        old_grants=c.execute(text('SELECT * FROM role_permissions')).all()
    upgrade(database);upgrade(database);require_current_schema(database)
    with database.connect() as c:
        assert c.execute(text('SELECT * FROM membership_applications')).all()==before
        grants=c.execute(text('SELECT * FROM role_permissions')).all()
        assert set(old_grants).issubset(set(grants))
        assert c.execute(text("SELECT r.name FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='applications:assist'")).scalars().all()==['administrator']
        assert c.execute(text('SELECT count(*) FROM application_submissions')).scalar()==0
    with Session(database) as db:
        db.add(ApplicationSubmission(application_id=1,source='public'));db.commit()
    with pytest.raises(RuntimeError,match='provenance is retained'),database.connect() as c:
        command.downgrade(migration_config(c),'0005_savings_interest')
    require_current_schema(database)


def test_concurrent_membership_workflow_posts_one_fee_approval_and_activation(migration_database):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import Session
    from app.bootstrap import bootstrap
    from app.models.application import MembershipApplication
    from app.models.membership import ApplicationRegistrationPayment,MembershipApproval
    from app.models.user import User
    from app.models.subscription import Subscription
    from app.models.contribution import Contribution
    from app.models.audit_event import AuditEvent
    from app.schemas.membership import PaymentRecord
    from app.services import membership
    database=migration_database
    upgrade(database)
    with Session(database) as db:
        bootstrap(db,'race-admin@example.test','Synthetic-only-race-123!')
        actor_id=db.query(User).filter_by(email='race-admin@example.test').one().id
        a=MembershipApplication(application_number='RACE-MEMBERSHIP',first_name='Concurrent',last_name='Synthetic',email='race-member@example.test',status='Pending')
        db.add(a);db.commit();app_id=a.id
    def perform(action):
        with Session(database) as db:
            actor=db.get(User,actor_id)
            if action=='record':membership.record_payment(db,actor,app_id,PaymentRecord(amount='20',currency='USD',payment_date='2026-01-01',reference='RACE-RECEIPT'))
            else:getattr(membership,action)(db,actor,app_id)
            db.commit()
    for action in ['record','verify_payment','approve','activate']:
        with ThreadPoolExecutor(max_workers=4) as executor:list(executor.map(lambda _:perform(action),range(4)))
    with Session(database) as db:
        assert db.query(ApplicationRegistrationPayment).count()==1
        assert db.query(MembershipApproval).count()==1
        assert db.query(Subscription).count()==1
        assert db.query(Contribution).count()==0
        for action in ['registration_fee_recorded','registration_fee_verified','membership_approved','account_activated']:
            assert db.query(AuditEvent).filter_by(action=action).count()==1
        from uuid import uuid4
        token,_=membership.create_invitation(db,db.get(User,actor_id),app_id,uuid4());db.commit()
    def consume(_):
        from app.exceptions import APIError
        with Session(database) as db:
            try:
                membership.consume_invitation(db,token,'Synthetic-only-setup-123!');db.commit();return 'consumed'
            except APIError as error:
                db.rollback();assert error.status_code==400;return 'denied'
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(consume,range(2)))==['consumed','denied']


def test_membership_migration_preserves_original_rows_and_limits_grants(migration_database):
    from alembic import command
    from app.migrations import migration_config
    from app.membership_policy import CAPABILITIES
    database=migration_database
    with database.connect() as c:command.upgrade(migration_config(c),'0006_assisted_registration')
    with database.begin() as c:
        c.execute(text("INSERT INTO roles(name) VALUES ('administrator'),('staff'),('finance'),('member')"))
        c.execute(text("INSERT INTO permissions(code) VALUES ('historical:read')"))
        c.execute(text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE p.code='historical:read'"))
        c.execute(text("INSERT INTO membership_applications(application_number,first_name,last_name,email,status) VALUES ('PRE-0007','Legacy','Synthetic','legacy7@example.test','Pending')"))
        before=c.execute(text('SELECT * FROM membership_applications')).all()
        grants=c.execute(text('SELECT * FROM role_permissions')).all()
    upgrade(database);upgrade(database);require_current_schema(database)
    with database.connect() as c:
        assert c.execute(text('SELECT * FROM membership_applications')).all()==before
        assert set(grants).issubset(set(c.execute(text('SELECT * FROM role_permissions')).all()))
        for code in CAPABILITIES:
            assert c.execute(text('SELECT r.name FROM roles r JOIN role_permissions rp ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code'),{'code':code}).scalars().all()==['administrator']
        for name in ['application_registration_payments','membership_approvals','password_setup_invitations']:
            assert c.execute(text(f'SELECT count(*) FROM {name}')).scalar()==0


def test_draft_migration_and_concurrent_versions(migration_database):
    from alembic import command
    from app.migrations import migration_config
    from sqlalchemy.orm import Session
    from concurrent.futures import ThreadPoolExecutor
    from app.models.user import User
    from app.models.role import Role
    from app.models.auth import AuthSession
    from app.models.plan_draft import PlanDraftVersion
    from app.schemas.plan_draft import DraftSave
    from app.routers.plan_drafts import save
    from app.exceptions import APIError
    from app.security.auth import digest
    from tests.test_auth import headers
    database = migration_database
    with database.connect() as c: command.upgrade(migration_config(c), '0007_membership_activation')
    with database.begin() as c:
        c.execute(text("INSERT INTO roles(name) VALUES ('administrator'),('staff'),('finance'),('member')"))
        c.execute(text("INSERT INTO savings_plans(name) VALUES ('Retained legacy plan')"))
        before = c.execute(text('SELECT * FROM savings_plans')).all()
    upgrade(database); upgrade(database); require_current_schema(database)
    with database.connect() as c:
        assert c.execute(text('SELECT * FROM savings_plans')).all() == before
        for code in ['plans:drafts:read', 'plans:drafts:write']:
            assert c.execute(text('SELECT r.name FROM roles r JOIN role_permissions rp ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code=:code'), {'code':code}).scalars().all() == ['administrator']
    with Session(database) as db:
        actor = User(email='draft-race@example.test', is_active=True, role_id=db.query(Role).filter_by(name='administrator').one().id)
        db.add(actor); db.commit()
        actor_id = actor.id
        headers(db, actor, 'draft-race-session')
        session = db.get(AuthSession, digest('draft-race-session'))
        first = save(db, actor, session, DraftSave(request_key=uuid.uuid4(), base_version=0, terms={}))
        identifier = first['draft_id']
    def revise(_):
        with Session(database) as db:
            try:
                save(db, db.get(User,actor_id), db.get(AuthSession,digest('draft-race-session')),
                     DraftSave(request_key=uuid.uuid4(), base_version=1, terms={'description':'Race proposal'}), identifier)
                return 'saved'
            except APIError as error:
                db.rollback(); assert error.status_code == 409; return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(revise, range(2))) == ['conflict', 'saved']
    with Session(database) as db:
        assert db.query(PlanDraftVersion).count() == 2
    with database.connect() as c:
        with pytest.raises(RuntimeError, match='history is retained'):
            command.downgrade(migration_config(c), '0007_membership_activation')
    require_current_schema(database)
