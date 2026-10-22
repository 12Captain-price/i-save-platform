import base64
import io
import json
from uuid import uuid4
from datetime import timedelta
import pytest
from PIL import Image
from app.models.application import MembershipApplication
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.evidence_enrolment import ApplicationEvidence, EvidenceReview, RegistrationEvidenceProfile
from app.models.business_settings import BusinessSettingsVersion, BusinessSettingsPublication
from app.services.business_settings import DEFAULTS
from app.services import evidence
from app.security.auth import now
from app.schemas.evidence import CONSENT_VERSION
from tests.test_auth import accounts, headers
from tests.test_membership_workflow import PAY, ACK


def image_upload(kind='residence',color='green'):
    output=io.BytesIO();Image.new('RGB',(10,10),color).save(output,format='PNG')
    return {'kind':kind,'filename':'synthetic.png','content_type':'image/png','data':base64.b64encode(output.getvalue()).decode()}


@pytest.fixture
def scan(monkeypatch):
    monkeypatch.setattr(evidence,'scan',lambda data:'Synthetic scanner fixture')


def application_body(**kwargs):
    return {'first_name':'Synthetic','last_name':'Evidence','email':'documents-only@example.test',
        'national_id':'SYNTHETIC-ID','income_source':'self_employed','evidence':[image_upload(),image_upload('self_employed')],
        'evidence_consent':True,'evidence_consent_version':CONSENT_VERSION,**kwargs}


def required(db,**patch):
    row=BusinessSettingsVersion(base_version=0,request_key=str(uuid4()),snapshot=json.dumps({**DEFAULTS,'require_national_id':True,'require_residence_evidence':True,'require_income_evidence':True,'require_evidence_acceptance':True,**patch}))
    from app.models.user import User
    actor=db.query(User).first()
    db.add(row);db.flush();db.add(BusinessSettingsPublication(version_id=row.id,request_key=str(uuid4()),request_snapshot='{}',effective_at=now()-timedelta(seconds=1),actor_id=actor.id,actor_email=actor.email));db.commit()


def submit(client,db):
    response=client.post('/api/v1/registration',json=application_body());assert response.status_code==202,response.text
    return db.query(MembershipApplication).filter_by(email='documents-only@example.test').one()


@pytest.mark.parametrize('field,value',[('evidence_consent',False),('evidence_consent','true'),('evidence_consent_version','old'),('actor_id',12)])
def test_consent_and_actor_spoofing_denied(client,db,scan,field,value):
    assert client.post('/api/v1/registration',json=application_body(**{field:value})).status_code==400
    assert db.query(ApplicationEvidence).count()==0


@pytest.mark.parametrize('patch',[
    {'filename':'../secret.png'}, {'filename':'bad\r\n.png'}, {'filename':'payload.exe'},
    {'content_type':'text/html'}, {'data':base64.b64encode(b'<script>bad</script>').decode()},
    {'data':'not base64!'}, {'data':'A'*(2796204+1)},
    {'content_type':'image/jpeg','filename':'wrong.jpg'},
])
def test_unsafe_uploads_denied_without_persistence(client,db,scan,patch):
    assert client.post('/api/v1/registration',json=application_body(evidence=[{**image_upload(),**patch}])).status_code==400
    assert db.query(ApplicationEvidence).count()==0


def test_scanner_failure_is_closed_and_test_mode_cannot_run_in_production(client,db,monkeypatch):
    from app.config import get_settings
    settings=get_settings();monkeypatch.setattr(settings,'document_scan_host','');monkeypatch.setattr(settings,'document_scan_test_only',True);monkeypatch.setattr(settings,'app_env','production')
    response=client.post('https://testserver/api/v1/registration',json=application_body())
    assert response.status_code==503 and db.query(ApplicationEvidence).count()==0
    assert evidence.test_scanner_allowed() is False


def test_production_private_intake_requires_https(client,db,monkeypatch,scan):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(),'app_env','production')
    response=client.post('/api/v1/registration',json=application_body())
    assert response.status_code==400 and response.json()['error']['code']=='https_required'
    assert db.query(ApplicationEvidence).count()==0


def test_duplicate_acknowledgement_and_private_download_permissions(client,db,accounts,scan):
    app=submit(client,db)
    first=client.post('/api/v1/registration',json=application_body())
    duplicate=client.post('/api/v1/registration',json=application_body(national_id='DO-NOT-OVERWRITE'))
    assert first.status_code==duplicate.status_code==202 and first.json()==duplicate.json()
    assert 'SYNTHETIC-ID' not in first.text and 'documents-only' not in first.text
    assert db.query(ApplicationEvidence).count()==2
    assert db.get(RegistrationEvidenceProfile,app.id).national_id=='SYNTHETIC-ID'
    doc=db.query(ApplicationEvidence).filter_by(application_id=app.id).first()
    prefix=f'/api/v1/application-documents/{app.id}'
    assert client.get(prefix).status_code==401
    for role in ['member','other','finance','staff']:
        auth=headers(db,accounts[role])
        assert client.get(prefix,headers=auth).status_code==403
        assert client.get(prefix+f'/{doc.id}/download',headers=auth).status_code==403
    auth=headers(db,accounts['administrator'])
    data=client.get(prefix,headers=auth).json()
    assert data['national_id']=='SYNTHETIC-ID' and data['items'][0]['status']=='Awaiting review'
    r=client.get(prefix+f'/{doc.id}/download',headers=auth)
    assert r.status_code==200 and r.content==doc.content and 'evidence-' in r.headers['content-disposition']
    assert r.headers['x-content-type-options']=='nosniff' and r.headers['cache-control']=='no-store'
    assert client.get(f'/api/v1/application-documents/{app.id+99}/{doc.id}/download',headers=auth).status_code==404
    # Ordinary application detail is not a document-access bypass.
    normal=client.get(f'/api/v1/applications/review/{app.id}',headers=auth)
    assert 'SYNTHETIC-ID' not in normal.text and 'content_type' not in normal.text


def test_requirements_snapshot_review_history_replacement_and_approval_gate(client,db,accounts,scan):
    # Publish requirements only for new applications. Legacy records remain unverified, not newly blocked.
    legacy=MembershipApplication(application_number='DOC-LEGACY',first_name='Old',last_name='Record',email='old-evidence@example.test',status='Pending');db.add(legacy);db.commit()
    required(db)
    assert evidence.approval_blockers(db,legacy.id)==[]
    assert client.post('/api/v1/registration',json=application_body(evidence=[])).status_code==400
    app=submit(client,db);auth=headers(db,accounts['administrator']);prefix=f'/api/v1/application-documents/{app.id}'
    paypath=f'/api/v1/membership/applications/{app.id}'
    assert client.post(paypath+'/payment',headers=auth,json=PAY).status_code==200
    assert client.post(paypath+'/verify',headers=auth,json={}).status_code==200
    assert client.post(paypath+'/approve',headers=auth,json=ACK).status_code==409
    documents=db.query(ApplicationEvidence).filter_by(application_id=app.id).all()
    for doc in documents:
        body={'request_key':str(uuid4()),'base_review_id':0,'outcome':'Accepted','reason':'Synthetic authorised review'}
        assert client.post(prefix+f'/{doc.id}/review',headers=auth,json=body).status_code==200
        assert client.post(prefix+f'/{doc.id}/review',headers=auth,json=body).status_code==200
    assert db.query(EvidenceReview).count()==2 and evidence.approval_blockers(db,app.id)==[]
    doc=documents[0]
    review=db.query(EvidenceReview).filter_by(evidence_id=doc.id).one()
    reject={'request_key':str(uuid4()),'base_review_id':review.id,'outcome':'Further information requested','reason':'Synthetic clarification needed'}
    assert client.post(prefix+f'/{doc.id}/review',headers=auth,json=reject).status_code==200
    assert client.post(prefix+f'/{doc.id}/review',headers=auth,json={**reject,'request_key':str(uuid4())}).status_code==409
    replacement={'request_key':str(uuid4()),'replaces_id':doc.id,'evidence':image_upload(doc.kind,'blue'),'applicant_authorized':True,'consent_version':CONSENT_VERSION}
    assert client.post(prefix+'/replace',headers=auth,json=replacement).status_code==200
    assert client.post(prefix+'/replace',headers=auth,json=replacement).status_code==200
    assert db.query(ApplicationEvidence).count()==3 and db.query(EvidenceReview).count()==3
    result=client.get(prefix,headers=auth).json()
    assert result['items'][0]['superseded'] and result['items'][-1]['status']=='Awaiting review'
    assert evidence.approval_blockers(db,app.id)
    newdoc=db.query(ApplicationEvidence).order_by(ApplicationEvidence.id.desc()).first()
    assert client.post(prefix+f'/{newdoc.id}/review',headers=auth,json={'request_key':str(uuid4()),'base_review_id':0,'outcome':'Accepted','reason':'Replacement accepted for synthetic test'}).status_code==200
    assert client.post(paypath+'/approve',headers=auth,json=ACK).status_code==200


@pytest.mark.parametrize('permission',['documents:view','documents:review','documents:replace'])
def test_document_permissions_are_separate(client,db,accounts,scan,permission):
    app=submit(client,db);user=accounts['administrator'];doc=db.query(ApplicationEvidence).first()
    db.add(UserPermission(user_id=user.id,permission_id=db.query(Permission).filter_by(code=permission).one().id,allowed=False));db.commit()
    auth=headers(db,user);prefix=f'/api/v1/application-documents/{app.id}'
    if permission=='documents:view':r=client.get(prefix,headers=auth)
    elif permission=='documents:review':r=client.post(prefix+f'/{doc.id}/review',headers=auth,json={'request_key':str(uuid4()),'base_review_id':0,'outcome':'Accepted','reason':'Synthetic'})
    else:r=client.post(prefix+'/replace',headers=auth,json={'request_key':str(uuid4()),'replaces_id':doc.id,'evidence':image_upload(),'applicant_authorized':True,'consent_version':CONSENT_VERSION})
    assert r.status_code==403


def test_chunked_body_limit_rejects_before_application_write(client,db):
    response=client.post('/api/v1/registration',content=b' '* (9*1024*1024+1),headers={'Content-Type':'application/json'})
    assert response.status_code==413 and db.query(MembershipApplication).count()==0


def test_specifically_authorised_staff_can_view_review_and_replace(client,db,accounts,scan):
    app=submit(client,db);staff=accounts['staff']
    for code in ['documents:view','documents:review','documents:replace','applications:assist']:
        db.add(UserPermission(user_id=staff.id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();auth=headers(db,staff);prefix=f'/api/v1/application-documents/{app.id}'
    response=client.get(prefix,headers=auth);assert response.status_code==200
    item=response.json()['items'][0]
    body={'request_key':str(uuid4()),'base_review_id':0,'outcome':'Rejected','reason':'Synthetic staff evidence review'}
    assert client.post(prefix+f"/{item['id']}/review",headers=auth,json={**body,'actor_id':accounts['administrator'].id}).status_code==400
    assert client.post(prefix+f"/{item['id']}/review",headers=auth,json=body).status_code==200
    review=db.query(EvidenceReview).filter_by(evidence_id=item['id']).one();assert review.actor_id==staff.id and review.actor_email==staff.email
    replacement={'request_key':str(uuid4()),'replaces_id':item['id'],'evidence':image_upload(item['kind'],'blue'),'applicant_authorized':True,'consent_version':CONSENT_VERSION}
    assert client.post(prefix+'/replace',headers=auth,json=replacement).status_code==200
    row=db.query(ApplicationEvidence).filter_by(replaces_id=item['id']).one();assert row.actor_id==staff.id and row.actor_email==staff.email
