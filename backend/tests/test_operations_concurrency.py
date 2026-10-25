from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4
import secrets
import hashlib
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import DBAPIError
from app.migrations import upgrade,require_current_schema,migration_config
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.operations import OperationsPolicy,OperationsEvent,BackupJob
from app.models.application import MembershipApplication
from app.models.evidence_enrolment import ApplicationEvidence,RegistrationEvidenceProfile
from app.schemas.operations import PolicySave,Publication,Erase,Job
from app.services import operations as service
from app.security.auth import now
from app.exceptions import APIError
from tests.test_migration_lifecycle import migration_database


def test_operations_migration_retains_immutable_history(migration_database):
    from alembic import command
    engine=migration_database;upgrade(engine)
    with Session(engine) as db:
        actor=bootstrap(db,'operations-history@example.test',secrets.token_urlsafe(30));service.save(db,actor,PolicySave(request_key=uuid4(),base_version=0,terms={}));db.commit()
    with engine.begin() as c:
        with pytest.raises(DBAPIError),c.begin_nested():c.execute(text("UPDATE operations_policies SET snapshot='{}'"))
    with pytest.raises(RuntimeError,match='history must be retained'),engine.connect() as c:command.downgrade(migration_config(c),'0017_campaigns')
    require_current_schema(engine)


def test_concurrent_draft_job_queue_and_retention_retry(migration_database,monkeypatch):
    from types import SimpleNamespace
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('Operations concurrency requires PostgreSQL advisory/row locks')
    upgrade(engine)
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(app_env='test',database_url='postgresql://db/isave_test_concurrent',secret_key='test'))
    with Session(engine) as db:
        actor=bootstrap(db,'operations-race@example.test',secrets.token_urlsafe(30));aid=actor.id
    def edit(_):
        with Session(engine) as db:
            try:service.save(db,db.get(User,aid),PolicySave(request_key=uuid4(),base_version=0,terms={'evidence_days':1,'identity_days':1}));db.commit();return 200
            except APIError:db.rollback();return 409
    with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(edit,range(2)))==[200,409]
    request=Job(request_key=uuid4(),kind='backup',confirm=True)
    def queue(_):
        with Session(engine) as db:row=service.queue(db,db.get(User,aid),request);db.commit();return row.id
    with ThreadPoolExecutor(2) as pool:assert len(set(pool.map(queue,range(2))))==1
    with Session(engine) as db:
        service.publish(db,db.get(User,aid),Publication(version=db.query(OperationsPolicy).one().id,request_key=uuid4(),confirm=True))
        app=MembershipApplication(application_number='TEST-RETENTION-RACE',email='race@example.test',first_name='TEST',last_name='ONLY',status='Rejected',reviewed_at=now()-timedelta(days=5));db.add(app);db.flush();db.add(RegistrationEvidenceProfile(application_id=app.id,national_id='TEST ONLY',requirements_snapshot='{}'))
        a=ApplicationEvidence(application_id=app.id,kind='residence',content=b'test',sha256=hashlib.sha256(b'test').hexdigest(),content_type='image/png',scan_engine='TEST ONLY',recorded_at=now()-timedelta(days=5));db.add(a);db.flush();db.add(ApplicationEvidence(application_id=app.id,kind='residence',content=b'test',sha256=a.sha256,content_type='image/png',scan_engine='TEST ONLY',replaces_id=a.id));db.commit()
        preview=service.preview(db);body=Erase(request_key=uuid4(),preview_digest=preview['preview_digest'],confirm=True,reason='TEST concurrent retry')
    def erase(_):
        with Session(engine) as db:service.erase(db,db.get(User,aid),body);db.commit()
    with ThreadPoolExecutor(2) as pool:list(pool.map(erase,range(2)))
    with Session(engine) as db:
        assert db.query(OperationsEvent).filter_by(action='retention_run').count()==1
        assert db.query(OperationsEvent).filter_by(action='erase').count()==2
        assert db.query(BackupJob).count()==1
