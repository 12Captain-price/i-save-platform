"""Isolated deployment boundaries; no normal database or external email."""
import pytest
from app.config import Settings,get_settings
from app.models.savings_plan import SavingsPlan
from app.models.auth import LoginThrottle
from app.security.auth import digest
from tests.test_auth import accounts,headers  # reusable isolated role fixtures


def production(**changes):
    values=dict(app_env='production',app_debug=False,public_origin='https://staging.isave.example.org',
        password_setup_frontend_url='https://staging.isave.example.org',cors_origins='https://staging.isave.example.org',
        database_url='postgresql+psycopg://operator:very-long-private-password@database/isave_staging',
        secret_key='a'*40,gateway_token='b'*43,document_scan_host='scanner',smtp_host='',smtp_from='disabled')
    values.update(changes)
    return Settings(_env_file=None,**values)


def test_safe_production_default_and_development_preservation(monkeypatch):
    monkeypatch.delenv('ISAVE_TEST_DATABASE_URL',raising=False)
    assert production().validate_runtime().effective_launch_mode=='informational'
    assert Settings(_env_file=None,app_env='development',launch_mode=None).effective_launch_mode=='full'


@pytest.mark.parametrize('changes',[
    {'app_debug':True},{'secret_key':'dev-secret-change-me'}, {'gateway_token':''},
    {'document_scan_test_only':True},{'document_scan_host':''},{'invitation_delivery':'mailpit'},
    {'smtp_host':'mailpit'},{'smtp_from':'local@example.test'},{'campaign_delivery_enabled':True},
    {'public_origin':'http://staging.isave.example.org'}, {'public_origin':'https://localhost'},
    {'public_origin':'https://localhost.'},{'public_origin':'https://127.0.0.2'},
    {'password_setup_frontend_url':'http://localhost:3000'}, {'database_url':'sqlite://'},
    {'database_url':'postgresql://operator:private-password@db/isave_test_gateway'},
])
def test_production_rejects_unsafe_configuration(changes,monkeypatch):
    monkeypatch.delenv('ISAVE_TEST_DATABASE_URL',raising=False)
    with pytest.raises(RuntimeError,match='Unsafe production'):production(**changes).validate_runtime()


def test_production_rejects_fixture_environment(monkeypatch):
    monkeypatch.setenv('TEST_CLOCK','fixture')
    with pytest.raises(RuntimeError):production().validate_runtime()


def test_private_configuration_repr_does_not_expose_credentials():
    settings=production()
    rendered=repr(settings)
    assert settings.database_url not in rendered and settings.gateway_token not in rendered and settings.secret_key not in rendered


def test_production_fixture_guard_rejects_accounts_without_mutation(db,accounts):
    from app.deployment import check_deployment_data
    from app.models.user import User
    settings=production()
    before=db.query(User).count()
    with pytest.raises(RuntimeError,match='fixture data detected'):check_deployment_data(db,settings)
    assert db.query(User).count()==before
    settings.deployment_tier='staging'
    check_deployment_data(db,settings)


def test_production_fixture_audit_guard_and_clean_inventory(db):
    from app.deployment import check_deployment_data
    from app.models.audit_event import AuditEvent
    settings=production()
    check_deployment_data(db,settings)
    db.add(AuditEvent(event_type='test_fixture',action='synthetic_test_only'));db.flush()
    with pytest.raises(RuntimeError,match='fixture data detected'):check_deployment_data(db,settings)
    assert db.query(AuditEvent).count()==1


def test_production_guard_blocks_explicitly_labelled_published_test_rate(db):
    from app.deployment import check_deployment_data
    from app.models.user import User
    from app.models.role import Role
    from app.models.fee_currency import FeeRateVersion,FeeRatePublication
    from app.security.auth import now
    from uuid import uuid4
    role=Role(name='administrator');db.add(role);db.flush()
    user=User(email='operator@isave.example.org',role_id=role.id);db.add(user);db.flush()
    version=FeeRateVersion(base_version=0,request_key=str(uuid4()),rate=34,source='TEST ONLY disposable rate');db.add(version);db.flush()
    # Unpublished experimental drafts do not become live policies.
    check_deployment_data(db,production())
    db.add(FeeRatePublication(version_id=version.id,request_key=str(uuid4()),request_snapshot='{}',effective_at=now(),actor_id=user.id,actor_email=user.email));db.flush()
    with pytest.raises(RuntimeError,match='fixture data detected'):check_deployment_data(db,production())
    assert db.query(FeeRatePublication).count()==1


@pytest.fixture
def modes(monkeypatch):
    settings=get_settings()
    monkeypatch.setattr(settings,'launch_mode','informational')
    return settings


@pytest.mark.parametrize('path',[
    '/api/v1/registration','/api/v1/registration/assisted',
    '/api/v1/application-documents/1/replace','/api/v1/member/plan-applications',
    '/api/v1/membership/applications/1/payment','/api/v1/membership/applications/1/approve',
    '/api/v1/membership/applications/1/activate','/api/v1/savings/contributions',
    '/api/v1/financial/subscriptions/run','/api/v1/withdrawals','/api/v1/fees','/api/v1/campaigns',
])
def test_informational_direct_mutations_blocked_before_body_validation(client,modes,path):
    assert client.post(path,json={}).status_code==503


def test_mode_availability_auth_and_admin_boundary(client,modes):
    assert client.get('/api/v1/public/availability').json()['mode']=='informational'
    assert client.get('/api/v1/public/contacts').status_code==200
    assert client.get('/api/v1/admin/organisation-settings').status_code==503
    # Recovery remains reachable and does not reveal whether an account exists.
    assert client.post('/api/v1/auth/login',json={}).status_code==400


def test_scheduler_launch_gate_precedes_database_work(modes,monkeypatch):
    from app import subscription_schedule
    monkeypatch.setattr('sys.argv',['subscription_schedule'])
    monkeypatch.setattr(subscription_schedule,'require_current_schema',lambda _:pytest.fail('Restricted generation reached database work'))
    with pytest.raises(SystemExit,match='unavailable'):subscription_schedule.main()


def test_campaign_worker_cannot_bypass_restricted_mode(modes,monkeypatch):
    from app.services import campaigns
    monkeypatch.setattr(modes,'campaign_delivery_enabled',True)
    monkeypatch.setattr(campaigns,'get_invitation_mailer',lambda:pytest.fail('Restricted worker attempted delivery'))
    assert campaigns.delivery_available() is False


def test_application_mode_allows_intake_not_money(client,modes):
    modes.launch_mode='applications'
    assert client.post('/api/v1/registration',json={}).status_code==400
    assert client.post('/api/v1/application-documents/1/replace',json={}).status_code==401
    assert client.post('/api/v1/membership/applications/1/approve',json={}).status_code==503
    assert client.post('/api/v1/financial/subscriptions/run',json={}).status_code==503


def test_informational_admin_access_never_opens_financial_writes(client,db,accounts,modes):
    admin=headers(db,accounts['administrator'])
    assert client.get('/api/v1/admin/organisation-settings',headers=admin).status_code==200
    assert client.post('/api/v1/admin/organisation-settings',headers=admin,json={}).status_code==400
    assert client.post('/api/v1/membership/applications/1/approve',headers=admin,json={}).status_code==503
    staff=headers(db,accounts['staff'])
    assert client.get('/api/v1/admin/organisation-settings',headers=staff).status_code==503


def test_legacy_catalogue_is_no_longer_public(client,db):
    db.add(SavingsPlan(name='TEST ONLY inactive unpublished',is_active=False));db.flush()
    assert client.get('/api/v1/plans').status_code==401
    assert client.get('/api/v1/plans/1').status_code==401
    assert client.get('/api/v1/public/plan-offers').json()=={'items':[]}


def gateway_headers(ip='198.51.100.21'):
    return {'x-isave-gateway':'b'*43,'x-isave-client-ip':ip,'x-isave-proto':'https'}


def test_authenticated_assertions_and_spoof_rejection(client,monkeypatch):
    settings=get_settings()
    monkeypatch.setattr(settings,'app_env','production');monkeypatch.setattr(settings,'gateway_token','b'*43)
    assert client.get('/api/v1/auth/me',headers={'X-Forwarded-Proto':'https','X-Forwarded-For':'198.51.100.21'}).status_code==403
    assert client.get('/api/v1/auth/me',headers={**gateway_headers(),'x-isave-gateway':'wrong'}).status_code==403
    assert client.get('/api/v1/auth/me',headers=gateway_headers('not-an-ip')).status_code==403
    # Reaches authentication, rather than the old HTTPS400 defect.
    assert client.get('/api/v1/auth/me',headers=gateway_headers()).status_code==401


def test_distinct_clients_share_database_limits_not_frontend_ip(client,db,monkeypatch):
    settings=get_settings();monkeypatch.setattr(settings,'app_env','production');monkeypatch.setattr(settings,'gateway_token','b'*43)
    for n in range(10):
        assert client.post('/api/v1/auth/login',headers=gateway_headers(),json={'email':f'absent{n}@example.test','password':'not-a-real-password'}).status_code==401
    assert client.post('/api/v1/auth/login',headers=gateway_headers(),json={'email':'absent11@example.test','password':'not-a-real-password'}).status_code==429
    assert client.post('/api/v1/auth/login',headers=gateway_headers('198.51.100.22'),json={'email':'other@example.test','password':'not-a-real-password'}).status_code==401
    assert db.get(LoginThrottle,digest('ip:198.51.100.21')).attempts==11
    assert db.get(LoginThrottle,digest('ip:198.51.100.22')).attempts==1


def test_streamed_auth_body_limit(client,monkeypatch):
    settings=get_settings();monkeypatch.setattr(settings,'app_env','production');monkeypatch.setattr(settings,'gateway_token','b'*43)
    assert client.post('/api/v1/auth/login',headers=gateway_headers(),content=b'x'*4097).status_code==413


def test_postgres_throttle_is_atomic_across_independent_connections(setup_test_db):
    from tests.conftest import test_engine
    from sqlalchemy.orm import Session
    from concurrent.futures import ThreadPoolExecutor
    from uuid import uuid4
    from app.services.auth import throttle
    from app.exceptions import APIError
    if test_engine.dialect.name!='postgresql':pytest.skip('PostgreSQL concurrency counterpart')
    key=digest('gateway-concurrent:'+str(uuid4()))
    def attempt(_):
        with Session(test_engine) as session:throttle(session,key)
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(attempt,range(10)))
        with Session(test_engine) as session:
            assert session.get(LoginThrottle,key).attempts==10
            with pytest.raises(APIError) as error:throttle(session,key)
            assert error.value.status_code==429
    finally:
        with Session(test_engine) as session:
            session.query(LoginThrottle).filter_by(key=key).delete();session.commit()
