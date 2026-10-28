"""Pure contract checks plus actual-role PostgreSQL acceptance (explicit opt-in).

PostgreSQL tests create a new retained isave_test_security_* database on the
dedicated security-test server. They never use DATABASE_URL as an admin target.
"""
import json
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.database_security import PURPOSES, OWNER, MIGRATOR, prepare_roles, provision, verify, privilege_plan
from app.security.audit_data import safe_details


def test_audit_redaction_nested_credentials_and_private_links():
    value=safe_details(json.dumps({'version':3,'nested':{'password':'not-real','token_hash':'not-real'},
        'notes':['https://private.invalid/setup#token=not-real','Bearer not-real']}))
    assert 'not-real' not in value
    assert json.loads(value)['version']==3


def test_worker_capability_boundaries():
    tables={'audit_events','application_evidence','backup_jobs','subscriptions','users','membership_approvals'}
    for purpose in ('account','subscriptions','operations'):
        reads,writes=privilege_plan(tables,purpose)
        assert 'application_evidence' not in reads
        assert 'users' not in writes or writes['users']=={'LOCK'}
    assert privilege_plan(tables,'api')[1]['membership_approvals']=={'INSERT','UPDATE'}
    assert privilege_plan(tables,'api')[1]['audit_events']=={'INSERT'}
    assert privilege_plan(tables,'backup')[1]=={}


def test_backup_transport_preserves_tls_and_does_not_inherit_secrets(monkeypatch):
    from app.services.backups import pg_environment
    monkeypatch.setenv('PRIVILEGED_MIGRATION_SECRET','must-not-inherit')
    monkeypatch.setenv('PGSERVICE','must-not-inherit')
    env=pg_environment('postgresql://reader:synthetic@db/source?sslmode=verify-full&sslrootcert=/private/ca.pem')
    assert env['PGSSLMODE']=='verify-full'
    assert env['PGSSLROOTCERT']=='/private/ca.pem'
    assert 'PRIVILEGED_MIGRATION_SECRET' not in env and 'PGSERVICE' not in env
    with pytest.raises(ValueError): pg_environment('postgresql://reader@db/source?options=unsafe')


def test_audit_migration_preserves_existing_rows_and_actor(tmp_path):
    from alembic import command
    from app.migrations import migration_config,require_current_schema
    database=create_engine('sqlite:///'+str(tmp_path/'historical.db'))
    with database.connect() as c: command.upgrade(migration_config(c),'0018_operations')
    with database.begin() as c:
        c.execute(text("INSERT INTO users(email) VALUES ('historical-audit@example.test')"))
        c.execute(text("INSERT INTO audit_events(event_type,action,actor_user_id,actor_email,details) VALUES ('history','retained',1,'historical-audit@example.test','Original historical evidence')"))
        before=tuple(c.execute(text('SELECT * FROM audit_events')).one())
    with database.connect() as c: command.upgrade(migration_config(c),'head')
    require_current_schema(database)
    with database.connect() as c:
        assert tuple(c.execute(text('SELECT * FROM audit_events')).one())==before
        for statement in ('UPDATE audit_events SET action=action','DELETE FROM audit_events'):
            with pytest.raises(DBAPIError): c.exec_driver_sql(statement)
            c.rollback()
    database.dispose()


@pytest.fixture(scope='module')
def role_database():
    raw=os.environ.get('ISAVE_SECURITY_ADMIN_URL')
    if not raw: pytest.skip('Requires isolated PostgreSQL actual-role security target')
    url=make_url(raw)
    portable = os.environ.get('ISAVE_SECURITY_PORTABLE_TEST')=='1' and url.host=='127.0.0.1' and url.port==16591
    if (url.host!='security-db' and not portable) or not (url.database or '').startswith('isave_test_'):
        raise RuntimeError('Security acceptance refuses non-isolated endpoints')
    admin=create_engine(url,hide_parameters=True)
    name='isave_test_security_'+uuid4().hex[:16]
    with admin.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
        c.exec_driver_sql('CREATE DATABASE '+name)
    target=url.set(database=name)
    owner_engine=create_engine(target,hide_parameters=True)
    passwords={role:secrets.token_urlsafe(32) for role in [MIGRATOR,*PURPOSES.values()]}
    with owner_engine.begin() as c:
        prepare_roles(c)
        # Synthetic random credentials exist only in process memory. Server-side
        # SCRAM encryption avoids putting a reusable password into SQL text.
        from psycopg import sql
        pg=c.connection.driver_connection
        for role,password in passwords.items():
            verifier=pg.pgconn.encrypt_password(password.encode(),role.encode()).decode()
            try: pg.execute(sql.SQL('ALTER ROLE {} PASSWORD {}').format(sql.Identifier(role),sql.Literal(verifier)))
            except Exception: raise RuntimeError('Synthetic role credential setup failed') from None
    migrator=create_engine(target.set(username=MIGRATOR,password=passwords[MIGRATOR]),hide_parameters=True)
    from app.config import get_settings
    from app.migrations import upgrade
    settings=get_settings();previous=settings.database_migration_role
    try:
        settings.database_migration_role=OWNER
        upgrade(migrator)
    finally: settings.database_migration_role=previous
    with owner_engine.begin() as c: provision(c,adopt=True)
    engines={purpose:create_engine(target.set(username=role,password=passwords[role]),hide_parameters=True)
             for purpose,role in PURPOSES.items()}
    yield {'admin':owner_engine,'roles':engines,'migrator':migrator}
    for e in [admin,owner_engine,migrator,*engines.values()]: e.dispose()
    # Deliberately retain the isolated database for investigation, not normal data.


@pytest.mark.parametrize('purpose',list(PURPOSES))
def test_actual_role_effective_privileges(role_database,purpose):
    with role_database['roles'][purpose].connect() as c: assert verify(c,purpose)['verified']


def test_existing_postgres_audit_survives_migration_and_actor_deletion_is_restricted(role_database):
    from alembic import command
    from app.migrations import migration_config
    admin=role_database['admin'];name='isave_test_history_'+uuid4().hex[:12]
    with admin.connect().execution_options(isolation_level='AUTOCOMMIT') as c: c.exec_driver_sql('CREATE DATABASE '+name)
    historical=create_engine(admin.url.set(database=name),hide_parameters=True)
    with historical.connect() as c: command.upgrade(migration_config(c),'0018_operations')
    with historical.begin() as c:
        c.exec_driver_sql("INSERT INTO users(email) VALUES ('retained-audit@example.test')")
        c.exec_driver_sql("INSERT INTO audit_events(event_type,action,actor_user_id,actor_email,details) VALUES ('historical','retain',1,'retained-audit@example.test','Original history; not rewritten')")
        before=c.exec_driver_sql('SELECT row_to_json(t)::text FROM audit_events t').scalar_one()
    with historical.connect() as c: command.upgrade(migration_config(c),'head')
    with historical.connect() as c:
        assert c.exec_driver_sql('SELECT row_to_json(t)::text FROM audit_events t').scalar_one()==before
        with pytest.raises(DBAPIError): c.exec_driver_sql('DELETE FROM users WHERE id=1')
        c.rollback()
    historical.dispose()


@pytest.mark.parametrize('purpose',list(PURPOSES))
@pytest.mark.parametrize('statement',[
    'CREATE TABLE public.forbidden(id integer)',
    'CREATE SCHEMA forbidden',
    'CREATE ROLE forbidden',
    'SET ROLE isave_owner',
    "SET session_replication_role='replica'",
    'ALTER TABLE audit_events DISABLE TRIGGER ALL',
    'ALTER TABLE audit_events OWNER TO isave_api',
    "CREATE OR REPLACE FUNCTION public.audit_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",
    "UPDATE audit_events SET action='forbidden'",
    'DELETE FROM audit_events',
    'TRUNCATE audit_events CASCADE',
])
def test_actual_roles_cannot_change_schema_escalate_or_tamper(role_database,purpose,statement):
    with role_database['roles'][purpose].connect() as c:
        with pytest.raises(DBAPIError): c.exec_driver_sql(statement)
        c.rollback()


@pytest.mark.parametrize('purpose',list(PURPOSES))
def test_actual_roles_cannot_delegate_audit_privileges(role_database,purpose):
    with role_database['roles'][purpose].connect() as c:
        try: c.exec_driver_sql('GRANT ALL ON audit_events TO PUBLIC')
        except DBAPIError: c.rollback()
        assert not c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.audit_events'::regclass AND a.grantee=0)")).scalar()
        c.rollback()


def test_privileged_session_cannot_hide_behind_runtime_set_role(role_database):
    with role_database['admin'].connect() as c:
        c.exec_driver_sql('SET ROLE isave_api')
        with pytest.raises(RuntimeError,match='authenticate directly'): verify(c,'api')
        c.rollback();c.exec_driver_sql('RESET ROLE');c.commit()


@pytest.mark.parametrize('purpose,statement',[
    ('account',"INSERT INTO audit_events(event_type,action) VALUES ('security','staff_permission_changed')"),
    ('account',"INSERT INTO audit_events(event_type,action,actor_email) VALUES ('security','public_recovery_link_issued','forged@example.test')"),
    ('subscriptions',"INSERT INTO audit_events(event_type,action,actor_email) VALUES ('subscription_generation','monthly_subscription_created','forged@example.test')"),
    ('operations',"INSERT INTO operations_events(action,target,snapshot,request_key) VALUES ('publish','1','{}','forbidden-publication')"),
    ('operations',"INSERT INTO operations_events(action,target,snapshot,request_key,actor_email) VALUES ('backup_result','1','{}','forbidden-attribution','forged@example.test')"),
    ('operations',"UPDATE backup_jobs SET actor_email='forged@example.test'"),
    ('api',"UPDATE backup_jobs SET state='Succeeded'"),
    ('account',"UPDATE account_links SET purpose='staff'"),
    ('account',"UPDATE campaigns SET latest_version=999"),
    ('account',"UPDATE campaign_recipients SET email_snapshot='forged@example.test'"),
    ('account',"UPDATE users SET is_active=true"),
])
def test_workers_cannot_forge_staff_publish_policy_or_rewrite_job_attribution(role_database,purpose,statement):
    with role_database['roles'][purpose].connect() as c:
        with pytest.raises(DBAPIError): c.exec_driver_sql(statement)
        c.rollback()


def test_audit_append_atomic_concurrent_and_owner_trigger_guard(role_database):
    database=role_database['roles']['api']
    marker='security-append-'+uuid4().hex
    def append(_):
        with database.begin() as c:
            c.execute(text("INSERT INTO audit_events(event_type,action) VALUES ('system',:action)"),{'action':marker})
    with ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(append,range(8)))
    with database.connect() as c:
        assert c.execute(text('SELECT count(*) FROM audit_events WHERE action=:a'),{'a':marker}).scalar()==8
    with role_database['migrator'].connect() as c:
        c.exec_driver_sql('SET ROLE isave_owner')
        for statement in ('UPDATE audit_events SET action=action','DELETE FROM audit_events','TRUNCATE audit_events'):
            with pytest.raises(DBAPIError): c.exec_driver_sql(statement)
            c.rollback();c.exec_driver_sql('SET ROLE isave_owner')


def test_repeat_concurrent_provisioning_preserves_audit(role_database):
    admin=role_database['admin']
    with admin.connect() as c: before=c.execute(text('SELECT count(*) FROM audit_events')).scalar()
    def apply(_):
        with admin.begin() as c: provision(c)
    with ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(apply,range(2)))
    with admin.connect() as c: assert c.execute(text('SELECT count(*) FROM audit_events')).scalar()==before
    for purpose,e in role_database['roles'].items():
        with e.connect() as c: verify(c,purpose)


def test_managed_style_non_superuser_can_provision_and_migrate(role_database):
    from psycopg import sql
    from app.config import get_settings
    from app.migrations import upgrade
    admin=role_database['admin'];login='operator_'+uuid4().hex[:12]
    password=secrets.token_urlsafe(32);name='isave_test_managed_'+uuid4().hex[:12]
    with admin.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
        pg=c.connection.driver_connection
        verifier=pg.pgconn.encrypt_password(password.encode(),login.encode()).decode()
        try:
            pg.execute(sql.SQL('CREATE ROLE {} LOGIN CREATEDB CREATEROLE INHERIT NOSUPERUSER NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Identifier(login),sql.Literal(verifier)))
            for managed in (OWNER,MIGRATOR,*PURPOSES.values()):
                pg.execute(sql.SQL('GRANT {} TO {} WITH ADMIN OPTION').format(sql.Identifier(managed),sql.Identifier(login)))
            pg.execute(sql.SQL('CREATE DATABASE {} OWNER {}').format(sql.Identifier(name),sql.Identifier(login)))
        except Exception: raise RuntimeError('Isolated managed-style operator setup failed') from None
    operator=create_engine(admin.url.set(database=name,username=login,password=password),hide_parameters=True)
    with operator.begin() as c:
        assert c.execute(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).scalar() is False
        prepare_roles(c)
    migrator=create_engine(role_database['migrator'].url.set(database=name),hide_parameters=True)
    settings=get_settings();previous=settings.database_migration_role
    try:
        settings.database_migration_role=OWNER;upgrade(migrator)
    finally: settings.database_migration_role=previous
    for _ in range(2):
        with operator.begin() as c: provision(c,adopt=True)
    api=create_engine(role_database['roles']['api'].url.set(database=name),hide_parameters=True)
    with api.connect() as c: assert verify(c,'api')['verified']
    api.dispose();migrator.dispose();operator.dispose()


def test_runtime_auth_recovery_and_worker_under_actual_roles(role_database):
    from app.models.user import User
    from app.models.role import Role
    from app.services import auth,account_workflows,campaigns
    from app.security.hashing import hash_password
    from app.security.auth import digest
    api=role_database['roles']['api']
    password=secrets.token_urlsafe(24)
    with Session(api) as db:
        from app.bootstrap import bootstrap
        user=bootstrap(db,'role-security@example.test',password)
        token,_=auth.login(db,user.email,password,'198.51.100.73')
        from app.models.auth import AuthSession
        assert db.get(AuthSession,digest(token)) is not None
        auth.revoke_all(db,user.id);db.commit()
        assert db.get(AuthSession,digest(token)).revoked_at is not None
        auth.throttle(db,digest('security-fixture-ip'))
        account_workflows.enqueue_recovery(db,user.email,uuid4())
    with Session(role_database['roles']['account']) as db:
        assert account_workflows.process_recovery(db)
        assert not campaigns.process_one(db)  # delivery is deliberately disabled
        assert db.execute(text('SELECT count(*) FROM account_links')).scalar()==1
        with pytest.raises(DBAPIError): db.execute(text('SELECT content FROM application_evidence'))
        db.rollback()


def test_subscription_generation_uses_actual_scheduler_role(role_database):
    from app.services.recurring_subscriptions import generate
    from app.models.membership import MembershipApproval
    from app.models.member import Member
    from app.models.application import MembershipApplication
    from app.models.user import User
    from app.models.role import Role
    from app.models.subscription import Subscription
    from app.security.auth import now
    from datetime import datetime,timezone
    api=role_database['roles']['api']
    previous=datetime(now().year-1,12,15,tzinfo=timezone.utc)
    with Session(api) as db:
        admin=db.query(User).filter_by(email='role-security@example.test').one()
        user=User(email='role-member@example.test',role_id=db.query(Role).filter_by(name='member').one().id,is_active=True)
        db.add(user);db.flush()
        member=Member(member_number='SYNTHETIC-ROLE-SECURITY',first_name='TEST',last_name='ONLY',user_id=user.id)
        db.add(member);db.flush()
        app=MembershipApplication(application_number='TEST-ROLE-SECURITY',first_name='TEST',last_name='ONLY',email=user.email,status='Activated',member_id=member.id)
        db.add(app);db.flush()
        db.add(MembershipApproval(application_id=app.id,member_id=member.id,user_id=user.id,
            approved_by=admin.id,approver_email=admin.email,approved_at=previous,activated_at=previous,
            acknowledgement_version='TEST ONLY',acknowledgement_text='TEST ONLY',subscription_start_month=f'{now().year}-01'))
        db.commit()
    scheduler=role_database['roles']['subscriptions']
    def run(_):
        with Session(scheduler) as db:
            result=generate(db,through=f'{now().year}-01');db.commit();return result['created']
    with ThreadPoolExecutor(max_workers=2) as pool: assert sorted(pool.map(run,range(2)))==[0,1]
    with Session(api) as db: assert db.query(Subscription).count()==1


def test_financial_posting_reversal_and_notices_under_actual_api_role(role_database):
    from datetime import timedelta
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db
    from app.models.user import User
    from app.models.role import Role
    from app.models.member import Member
    from app.models.permission import Permission
    from app.models.auth import UserPermission
    from app.models.evidence_enrolment import PlanApplication,PlanEnrolment
    from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
    from app.models.savings import SavingsLedgerEntry
    from app.services.business_settings import DEFAULTS
    from app.services.savings import summary
    from app.security.auth import now
    from tests.test_auth import headers
    from tests.test_plan_enrolment import published,apply_body
    from tests.test_savings_workflow import decision
    with Session(role_database['roles']['api']) as db:
        app.dependency_overrides[get_db]=lambda: db
        try:
            client=TestClient(app)
            admin=db.query(User).filter_by(email='role-security@example.test').one()
            member=db.query(User).filter_by(email='role-member@example.test').one()
            admin_headers=headers(db,admin);member_headers=headers(db,member)
            version=published(client,db,admin_headers)
            response=client.post('/api/v1/member/plan-applications',headers=member_headers,json=apply_body(version))
            assert response.status_code==201
            plan=db.get(PlanApplication,response.json()['id']);plan.status='Active'
            db.add(PlanEnrolment(application_id=plan.id,activated_at=now(),start_date=now().date()-timedelta(days=2),end_date=now().date()+timedelta(days=200),actor_id=admin.id,actor_email=admin.email))
            settings=BusinessSettingsVersion(base_version=0,request_key=str(uuid4()),snapshot=json.dumps({**DEFAULTS,'savings_week_start':'enrolment_start'}),actor_id=admin.id,actor_email=admin.email)
            db.add(settings);db.flush()
            db.add(BusinessSettingsPublication(version_id=settings.id,request_key=str(uuid4()),request_snapshot='TEST ONLY role acceptance',effective_at=now(),actor_id=admin.id,actor_email=admin.email))
            reviewers=[]
            for i,capability in enumerate(('savings:verify','savings:reconcile')):
                reviewer=User(email=f'role-reviewer-{i}@example.test',role_id=db.query(Role).filter_by(name='finance').one().id,is_active=True)
                db.add(reviewer);db.flush();db.add(UserPermission(user_id=reviewer.id,permission_id=db.query(Permission).filter_by(code=capability).one().id,allowed=True));db.commit()
                reviewers.append(headers(db,reviewer))
            body={'request_key':str(uuid4()),'enrolment_id':plan.id,'amount':'10.00','currency':'USD','payment_date':str(now().date()),'method':'TEST ONLY cash','reference':'TEST-ROLE-'+uuid4().hex}
            first=client.post('/api/v1/savings',headers=admin_headers,json=body);assert first.status_code==201
            row=first.json()
            assert client.post('/api/v1/savings',headers=admin_headers,json=body).json()['id']==row['id']
            assert not summary(db,plan.member_id)['confirmed']
            verified=client.post(f"/api/v1/savings/{row['id']}/verify",headers=reviewers[0],json=decision(row,'Verified'))
            assert verified.status_code==200
            row=verified.json();matched=decision(row,'Matched',observed_amount='10.00',observed_currency='USD',observed_reference=body['reference'])
            for _ in range(2):
                confirmed=client.post(f"/api/v1/savings/{row['id']}/reconcile",headers=reviewers[1],json=matched)
                assert confirmed.status_code==200
            assert summary(db,plan.member_id)['confirmed']==[{'currency':'USD','amount':'10.00'}]
            reversed=client.post(f"/api/v1/savings/{row['id']}/reverse",headers=admin_headers,json=decision(confirmed.json(),'Reversed'))
            assert reversed.status_code==200
            assert summary(db,plan.member_id)['confirmed']==[{'currency':'USD','amount':'0.00'}]
            assert db.query(SavingsLedgerEntry).count()==2
            assert client.get(f"/api/v1/savings/{row['id']}/receipt",headers=member_headers).status_code==200
        finally:
            app.dependency_overrides.pop(get_db,None)


def test_encrypted_backup_and_independent_precreated_restore_with_restricted_roles(role_database,tmp_path,monkeypatch):
    import hashlib,shutil,subprocess
    from app.config import get_settings
    from app.models.operations import BackupJob
    from app.models.evidence_enrolment import ApplicationEvidence
    from app.models.application import MembershipApplication
    from app.services import backups,operations
    raw=os.environ.get('ISAVE_SECURITY_RESTORE_URL')
    if not raw or not shutil.which('pg_restore'): pytest.skip('Independent PostgreSQL restore target/client tools required')
    target=make_url(raw)
    portable=os.environ.get('ISAVE_SECURITY_PORTABLE_TEST')=='1' and target.host=='127.0.0.1' and target.port==16592
    if target.host!='security-restore' and not portable: raise RuntimeError('Restore test refuses non-isolated endpoint')
    target_admin=create_engine(target,hide_parameters=True)
    name='isave_restore_security_'+uuid4().hex[:12]
    login='restore_'+uuid4().hex[:12]
    password=secrets.token_urlsafe(32)
    from psycopg import sql
    with target_admin.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
        pg=c.connection.driver_connection
        verifier=pg.pgconn.encrypt_password(password.encode(),login.encode()).decode()
        try:
            pg.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Identifier(login),sql.Literal(verifier)))
            pg.execute(sql.SQL('CREATE DATABASE {} OWNER {}').format(sql.Identifier(name),sql.Identifier(login)))
        except Exception: raise RuntimeError('Disposable restore target preparation failed') from None
        right=c.execute(text('SELECT system_identifier::text FROM pg_control_system()')).scalar_one()
    reader=role_database['roles']['backup'];jobs=role_database['roles']['operations'];api=role_database['roles']['api']
    with role_database['admin'].connect() as c: left=c.execute(text('SELECT system_identifier::text FROM pg_control_system()')).scalar_one()
    assert left!=right
    # Independently initialized clusters on distinct endpoints. Avoid Windows
    # localhost IPv6 fallback; production still refuses loopback public setup.
    restore_url=target.set(database=name,username=login,password=password)
    def endpoint(u): return {'host':u.host,'port':u.port or 5432,'database':u.database}
    proof=tmp_path/'independence.private.json'
    proof.write_text(json.dumps({'source':endpoint(reader.url),'target':endpoint(restore_url),
        'source_provider_id':left,'target_provider_id':right,'independence_verified':True}))
    key=tmp_path/'archive.private.key';key.write_bytes(secrets.token_bytes(32))
    settings=get_settings()
    monkeypatch.setattr(settings,'restore_test_url',restore_url.render_as_string(hide_password=False))
    monkeypatch.setattr(settings,'restore_target_mode','precreated')
    monkeypatch.setattr(settings,'restore_independence_file',str(proof))
    monkeypatch.setattr(settings,'backup_key_file',str(key))
    monkeypatch.setattr(settings,'backup_directory',str(tmp_path/'archives'))
    monkeypatch.setattr(settings,'backup_source_url',reader.url.render_as_string(hide_password=False))
    with Session(api) as db:
        app=db.query(MembershipApplication).first()
        content=b'TEST ONLY synthetic document integrity fixture'
        db.add(ApplicationEvidence(application_id=app.id,kind='residence',content=content,sha256=hashlib.sha256(content).hexdigest(),content_type='application/octet-stream',scan_engine='TEST ONLY; never production'))
        db.add(BackupJob(kind='backup',request_key=str(uuid4()),state='Queued',reason='TEST ONLY restricted worker'))
        db.commit()
    # Windows has no resource module or /dev/shm. Exercise actual PostgreSQL
    # transport/dump/restore here; Linux bounded tmpfs execution is separately
    # covered by the Docker target and remains an explicit deployment check.
    if os.name=='nt':
        def command(args,url,input=None):
            result=subprocess.run(args,input=input,capture_output=True,env=backups.pg_environment(url),timeout=90)
            if result.returncode: raise RuntimeError('Disposable PostgreSQL tool failed; raw stderr suppressed')
            return result.stdout
        monkeypatch.setattr(backups,'command',command)
    assert backups.process_one(jobs)=='Succeeded'
    with Session(jobs) as db:
        backup=db.query(BackupJob).filter_by(kind='backup').one()
        db.add(BackupJob(kind='restore-test',backup_id=backup.id,request_key=str(uuid4()),state='Queued',reason='TEST ONLY independent target'));db.commit()
    assert backups.process_one(jobs)=='Succeeded'
    restored=create_engine(restore_url,hide_parameters=True)
    with restored.connect() as c:
        assert c.execute(text('SELECT count(*) FROM application_evidence')).scalar()==1
        assert bytes(c.execute(text('SELECT content FROM application_evidence')).scalar())==content
        assert c.execute(text('SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user')).scalar() is False
    with Session(jobs) as db:
        assert db.query(BackupJob).filter_by(state='Succeeded').count()==2
        assert db.execute(text("SELECT count(*) FROM operations_events WHERE action='restore_verified'")).scalar()==1
    # A repeated restore cannot overwrite the retained target.
    with Session(jobs) as db:
        job=db.query(BackupJob).filter_by(kind='restore-test').one()
        with pytest.raises(ValueError,match='not empty'): backups.restore_test(job,reader,job_engine=jobs)
    restored.dispose();target_admin.dispose()


def test_account_worker_dispatch_keeps_approved_version_and_recipient_snapshot(role_database,monkeypatch):
    from unittest.mock import Mock
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db
    from app.models.user import User
    from app.models.campaign import Campaign,CampaignRecipient
    from app.services import campaigns
    from tests.test_auth import headers
    from tests.test_campaigns import consent,queued
    mailer=Mock(available=True,mode='mailpit')
    monkeypatch.setattr(campaigns,'delivery_available',lambda:True)
    monkeypatch.setattr(campaigns,'get_invitation_mailer',lambda:mailer)
    with Session(role_database['roles']['api']) as db:
        app.dependency_overrides[get_db]=lambda:db
        try:
            client=TestClient(app)
            admin=db.query(User).filter_by(email='role-security@example.test').one()
            member=db.query(User).filter_by(email='role-member@example.test').one()
            h=headers(db,admin,secrets.token_urlsafe(32));own=headers(db,member,secrets.token_urlsafe(32))
            assert consent(client,own).status_code==200
            queued(client,h)
            c=db.query(Campaign).one();r=db.query(CampaignRecipient).one()
            before=(c.latest_version,r.email_snapshot,r.user_id,r.version_id)
        finally: app.dependency_overrides.pop(get_db,None)
    with Session(role_database['roles']['account']) as db:
        assert campaigns.process_one(db)
        assert not campaigns.process_one(db)
        c=db.query(Campaign).one();r=db.query(CampaignRecipient).one()
        assert (c.latest_version,r.email_snapshot,r.user_id,r.version_id)==before
        assert c.state=='Complete' and r.attempts==1
    assert mailer.send_campaign.call_count==1  # no payload/token in failure output


def test_actual_backup_reader_consistent_dump(role_database):
    import shutil,subprocess
    from app.services.backups import pg_environment,inventory
    if not shutil.which('pg_dump'): pytest.skip('PostgreSQL client tools required')
    reader=role_database['roles']['backup']
    with reader.connect().execution_options(isolation_level='REPEATABLE READ') as c:
        c.exec_driver_sql('SET TRANSACTION READ ONLY')
        snapshot=c.execute(text('SELECT pg_export_snapshot()')).scalar_one()
        assert inventory(c)['tables']['audit_events']['rows']>=8
        result=subprocess.run(['pg_dump','-Fc','--no-owner','--no-acl','--snapshot='+snapshot],
            env=pg_environment(reader.url),capture_output=True,timeout=90)
        assert result.returncode==0,'Read-only backup failed; raw stderr intentionally suppressed'
        assert result.stdout.startswith(b'PGDMP')
