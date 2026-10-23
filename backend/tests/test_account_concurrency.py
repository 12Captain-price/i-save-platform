"""Account races with independent PostgreSQL transactions and migrated schema."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
import pytest
from sqlalchemy.orm import Session
from app.migrations import upgrade
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.account_workflows import AccountLink, Notification
from app.security.auth import now, digest
from app.services import account_workflows as service
from app.exceptions import APIError
from tests.test_migration_lifecycle import migration_database


@pytest.mark.parametrize('purpose',['staff','recovery'])
def test_concurrent_setup_consumes_exactly_once(migration_database,purpose):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('Independent link consumption requires PostgreSQL row locks')
    upgrade(engine)
    with Session(engine) as db:
        admin=bootstrap(db,'race-admin@example.test','Synthetic-test-only-123!')
        staff=User(email='race-staff@example.test',role_id=db.query(Role).filter_by(name='staff').one().id,is_active=True)
        db.add(staff);db.flush()
        row,token=service.issue(db,staff,purpose,uuid4(),admin);db.commit();identifier=staff.id
    barrier=Barrier(2)
    def consume(_):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            try:service.consume(db,token,'Synthetic-new-password-123!',purpose);return 204
            except APIError as exc:db.rollback();return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:outcomes=sorted(pool.map(consume,range(2)))
    assert outcomes==[204,400]
    with Session(engine) as db:
        assert db.query(AccountLink).filter_by(user_id=identifier).count()==1
        assert db.get(AccountLink,digest(token)).consumed_at
        assert db.query(Notification).filter_by(user_id=identifier).count()==1


def test_concurrent_notification_deduplication(migration_database):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('Concurrent event delivery requires PostgreSQL')
    upgrade(engine)
    with Session(engine) as db:
        identifier=bootstrap(db,'outbox-admin@example.test','Synthetic-test-only-123!').id
    barrier=Barrier(2)
    def write(_):
        with Session(engine) as db:
            barrier.wait(timeout=10);service.notify(db,identifier,'same-completed-event','Update available','dashboard');db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(write,range(2)))
    with Session(engine) as db:assert db.query(Notification).count()==1
