"""Isolated operational policy, failure-closed scans and authenticated archives."""
import base64
import hashlib
import io
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import Mock
import pytest
from PIL import Image
from app.models.operations import OperationsPolicy,OperationsEvent,BackupJob
from app.models.application import MembershipApplication
from app.models.evidence_enrolment import ApplicationEvidence as Evidence,RegistrationEvidenceProfile as Profile,EvidenceReview
from app.security.auth import now
from app.services import operations as service,scanner,backups,evidence
from app.exceptions import APIError
from tests.test_auth import accounts,headers

ROOT='/api/v1/admin/operations'

@pytest.fixture
def actors(db,accounts):return {k:headers(db,v) for k,v in accounts.items()}

def draft(client,h,base=0,**terms):return client.post(ROOT+'/draft',headers=h,json={'request_key':str(uuid4()),'base_version':base,'terms':terms})
def published(client,h,**terms):
    row=draft(client,h,**terms);assert row.status_code==200,row.text
    result=client.post(ROOT+'/publish',headers=h,json={'request_key':str(uuid4()),'version':row.json()['version'],'confirm':True});assert result.status_code==200,result.text
    return row.json()['version']

@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_operations_not_implicitly_delegable(client,db,accounts,actors,role):
    assert client.get(ROOT,headers=actors[role]).status_code==403
    assert client.post(ROOT+'/jobs',headers=actors[role],json={'request_key':str(uuid4()),'kind':'backup','confirm':True}).status_code==403
    from app.models.auth import UserPermission
    from app.models.permission import Permission
    db.add(UserPermission(user_id=accounts[role].id,permission_id=db.query(Permission).filter_by(code='operations:read').one().id,allowed=True));db.commit()
    assert client.get(ROOT,headers=actors[role]).status_code==403


@pytest.mark.parametrize('capability,path,fields',[
    ('retention:draft','/draft',{'base_version':0,'terms':{}}),
    ('retention:publish','/publish',{'version':1,'confirm':True}),
    ('retention:hold','/hold',{'application_id':1,'base_event':0,'enabled':True,'reason':'TEST legal hold'}),
    ('retention:execute','/erase',{'preview_digest':'a'*64,'confirm':True,'reason':'TEST erasure'}),
    ('backups:restore-test','/jobs',{'kind':'restore-test','backup_id':1,'confirm':True}),
])
def test_individual_operational_permissions_enforced(client,db,accounts,actors,capability,path,fields):
    from app.models.auth import UserPermission
    from app.models.permission import Permission
    db.add(UserPermission(user_id=accounts['administrator'].id,permission_id=db.query(Permission).filter_by(code=capability).one().id,allowed=False));db.commit()
    assert client.post(ROOT+path,headers=actors['administrator'],json={'request_key':str(uuid4()),**fields}).status_code==403


def test_unset_drafts_conflicts_publication_effective_date_and_audit(client,db,actors,accounts):
    h=actors['administrator'];assert service.active(db)[1]=={'evidence_days':None,'identity_days':None,'backup_interval_hours':None}
    body={'request_key':str(uuid4()),'base_version':0,'terms':{'evidence_days':30}}
    for _ in range(2):assert client.post(ROOT+'/draft',headers=h,json=body).status_code==200
    assert db.query(OperationsPolicy).count()==1 and service.active(db)[0]==0
    assert draft(client,h,evidence_days=10).status_code==409
    assert draft(client,h,base=1,evidence_days=0).status_code==400
    assert draft(client,h,base=1,evidence_days=True).status_code==400
    assert client.post(ROOT+'/draft',headers=h,json={**body,'actor_id':accounts['member'].id}).status_code==400
    future=now()+timedelta(hours=1);version=db.query(OperationsPolicy).one().id
    payload={'request_key':str(uuid4()),'version':version,'confirm':True,'effective_at':future.isoformat()}
    for _ in range(2):assert client.post(ROOT+'/publish',headers=h,json=payload).status_code==200
    assert service.active(db)[0]==0 and service.active(db,future+timedelta(seconds=1))[0]==version
    assert db.query(OperationsEvent).filter_by(action='publish',actor_id=accounts['administrator'].id).count()==1
    assert client.post(ROOT+'/publish',headers=h,json={**payload,'request_key':str(uuid4()),'effective_at':now().isoformat()}).status_code==409


def test_publication_requires_confirmation_and_timezone(client,actors):
    h=actors['administrator'];v=draft(client,h).json()['version']
    for extra in [{'confirm':False},{'effective_at':'2026-10-30T10:00:00'}]:
        assert client.post(ROOT+'/publish',headers=h,json={'request_key':str(uuid4()),'version':v,'confirm':True,**extra}).status_code==400


@pytest.fixture
def records(db,accounts):
    app=MembershipApplication(application_number='TEST-RETENTION',email='synthetic@example.test',first_name='TEST',last_name='ONLY',status='Rejected',reviewed_at=now()-timedelta(days=100))
    db.add(app);db.flush();db.add(Profile(application_id=app.id,national_id='SYNTHETIC-ID',requirements_snapshot='{}'))
    content=b'SYNTHETIC private bytes';rows=[]
    for _ in range(2):
        row=Evidence(application_id=app.id,kind='residence',content=content,sha256=hashlib.sha256(content).hexdigest(),content_type='image/png',scan_engine='TEST ONLY',recorded_at=now()-timedelta(days=100),replaces_id=rows[-1].id if rows else None)
        db.add(row);db.flush();rows.append(row)
    db.add(EvidenceReview(evidence_id=rows[0].id,outcome='Accepted',reason='TEST retained review',actor_id=accounts['administrator'].id,actor_email=accounts['administrator'].email,request_key=str(uuid4())))
    db.commit();return app,rows


def test_holds_preview_stale_digest_erasure_tombstone_and_download(client,db,records,actors,monkeypatch):
    app,rows=records;h=actors['administrator'];published(client,h,evidence_days=30,identity_days=60)
    p=client.get(ROOT+'/retention-preview',headers=h).json();assert p['evidence_ids']==[rows[0].id] and p['identity_application_ids']==[app.id]
    hold={'request_key':str(uuid4()),'application_id':app.id,'base_event':0,'enabled':True,'reason':'TEST legal hold'}
    for _ in range(2):assert client.post(ROOT+'/hold',headers=h,json=hold).status_code==200
    assert not service.preview(db)['evidence_ids']
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(app_env='test',database_url='postgresql://localhost/isave_test_synthetic',secret_key='test'))
    erase={'request_key':str(uuid4()),'preview_digest':p['preview_digest'],'confirm':True,'reason':'TEST ONLY deletion'}
    assert client.post(ROOT+'/erase',headers=h,json=erase).status_code==409
    hold_event=service.holds(db)[app.id]['event_id'];assert client.post(ROOT+'/hold',headers=h,json={**hold,'request_key':str(uuid4()),'base_event':hold_event,'enabled':False}).status_code==200
    p=service.preview(db);erase['preview_digest']=p['preview_digest']
    for _ in range(2):assert client.post(ROOT+'/erase',headers=h,json=erase).status_code==200
    db.refresh(rows[0]);db.refresh(rows[1]);assert rows[0].content==b'' and rows[1].content and db.query(EvidenceReview).count()==1
    assert db.get(Profile,app.id).national_id is None and db.query(OperationsEvent).filter_by(action='erase').count()==2
    assert client.get(f'/api/v1/application-documents/{app.id}/{rows[0].id}/download',headers=h).status_code==410
    assert client.get(f'/api/v1/application-documents/{app.id}/{rows[1].id}/download',headers=actors['member']).status_code==403


def test_normal_deletion_disabled_unset_and_pending_preserved(client,db,records,actors,monkeypatch):
    app,rows=records;h=actors['administrator'];assert not service.preview(db)['evidence_ids']
    published(client,h,evidence_days=1,identity_days=1)
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(app_env='development',database_url='postgresql://db/isave',secret_key='test'))
    p=service.preview(db);assert not p['execution_available']
    assert client.post(ROOT+'/erase',headers=h,json={'request_key':str(uuid4()),'confirm':True,'preview_digest':p['preview_digest'],'reason':'Blocked normal deletion'}).status_code==403
    app.status='Pending';db.commit();assert not service.preview(db)['identity_application_ids'] and not service.preview(db)['evidence_ids']


def test_job_retries_permissions_and_failure_status(client,db,actors,accounts):
    h=actors['administrator'];payload={'request_key':str(uuid4()),'kind':'backup','confirm':True}
    for _ in range(2):assert client.post(ROOT+'/jobs',headers=h,json=payload).json()['id']==db.query(BackupJob).one().id
    assert db.query(BackupJob).count()==1
    assert client.post(ROOT+'/jobs',headers=h,json={**payload,'kind':'restore-test','backup_id':1}).status_code==409
    assert client.post(ROOT+'/jobs',headers=h,json={'request_key':str(uuid4()),'kind':'restore-test','backup_id':1,'confirm':True}).status_code==400
    assert client.post(ROOT+'/jobs',headers=h,json={**payload,'actor_id':accounts['member'].id}).status_code==400
    from app.models.auth import UserPermission
    from app.models.permission import Permission
    db.add(UserPermission(user_id=accounts['administrator'].id,permission_id=db.query(Permission).filter_by(code='backups:run').one().id,allowed=False));db.commit()
    assert client.post(ROOT+'/jobs',headers=h,json={**payload,'request_key':str(uuid4())}).status_code==403


def test_authenticated_encryption_tamper_wrong_key_and_unique_nonce():
    from cryptography.exceptions import InvalidTag
    secret=b'k'*32;payload=b'SYNTHETIC private archive'
    first=backups.seal(payload,secret);assert payload not in first and first!=backups.seal(payload,secret)
    assert backups.unseal(first,secret)==payload
    for bad,k in [(first,b'x'*32),(first[:-1]+bytes([first[-1]^1]),secret)]:
        with pytest.raises(InvalidTag):backups.unseal(bad,k)


def test_restore_same_host_and_cluster_refused(monkeypatch):
    monkeypatch.setattr(backups,'get_settings',lambda:SimpleNamespace(restore_test_url='postgresql://u@db/postgres'))
    source=SimpleNamespace(url=__import__('sqlalchemy').engine.make_url('postgresql://u@db/isave'))
    with pytest.raises(ValueError,match='isolation'):backups.restore_test(SimpleNamespace(backup_id=1),source)


def test_schedule_consumes_only_effective_published_interval_once(client,db,actors):
    h=actors['administrator']
    assert backups.schedule(db) is False
    draft(client,h,backup_interval_hours=24)
    assert backups.schedule(db) is False
    response=client.post(ROOT+'/publish',headers=h,json={'request_key':str(uuid4()),'version':db.query(OperationsPolicy).one().id,'confirm':True})
    assert response.status_code==200
    assert backups.schedule(db) is True and backups.schedule(db) is False
    row=db.query(BackupJob).one();row.recorded_at=now()-timedelta(days=5);db.commit()
    assert backups.schedule(db) is True and db.query(BackupJob).count()==2
    assert all(j.actor_id is None for j in db.query(BackupJob))


@pytest.mark.parametrize('failure',[TimeoutError,OSError,ValueError])
def test_scanner_failures_are_closed(monkeypatch,failure):
    monkeypatch.setattr(scanner,'version',Mock(side_effect=failure))
    with pytest.raises(APIError) as exc:scanner.scan(b'SYNTHETIC')
    assert exc.value.status_code==503 and 'SYNTHETIC' not in str(exc.value)


def test_fragmented_bounded_scanner_reply_and_oversize():
    import time
    sock=Mock();sock.recv.side_effect=[b'str',b'eam: OK',b'\0'];assert scanner.reply(sock,time.monotonic()+1)==b'stream: OK'
    sock.recv.side_effect=[b'x'*1024]*5
    with pytest.raises(ValueError):scanner.reply(sock,time.monotonic()+1)


@pytest.mark.parametrize('age,valid',[(0,True),(47,True),(49,False),(-1,False)])
def test_signature_freshness(monkeypatch,age,valid):
    stamp=(now()-timedelta(hours=age)).strftime('%a %b %d %H:%M:%S %Y')
    sock=Mock();sock.recv.return_value=('ClamAV 1.4/123/'+stamp+'\0').encode();manager=Mock();manager.__enter__=Mock(return_value=sock);manager.__exit__=Mock(return_value=False)
    monkeypatch.setattr(scanner.socket,'create_connection',lambda *a,**kw:manager)
    if valid:assert scanner.version().startswith('ClamAV')
    else:
        with pytest.raises(ValueError):scanner.version()


def test_real_clamav_clean_image_and_harmless_standard_antivirus_fixture(monkeypatch):
    # Only the isolated Compose scanner. No real malware or stored infected bytes.
    from app.config import get_settings
    if not get_settings().document_scan_host:pytest.skip('Real private ClamAV integration requires isolated Compose scanner')
    monkeypatch.setattr(evidence,'test_scanner_allowed',lambda:False)
    output=io.BytesIO();Image.new('RGB',(40,40),'white').save(output,format='PNG');clean=output.getvalue()
    assert scanner.scan(clean).startswith('ClamAV')
    marker=base64.b64decode('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=')
    with pytest.raises(APIError) as exc:scanner.scan(marker)
    assert exc.value.status_code==400
    from app.schemas.evidence import EvidenceUpload
    # Standard fixture is a whole test file, not an image trailer (ClamAV's
    # format parsers may ignore bytes following a complete image).
    with pytest.raises(APIError):evidence.validate_upload(EvidenceUpload(kind='residence',filename='TEST.png',content_type='image/png',data=base64.b64encode(marker).decode()))
