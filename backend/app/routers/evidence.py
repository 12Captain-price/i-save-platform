from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.security.auth import require, current_session
from app.routers.membership import protected, commit
from app.models.evidence_enrolment import ApplicationEvidence
from app.schemas.evidence import EvidenceReplace, EvidenceDecision, CONSENT_TEXT, CONSENT_VERSION
from app.services import evidence as service
from app.services.business_settings import active

router = APIRouter(tags=['private registration documents'])
PREFIX = '/api/v1/application-documents'


@router.get('/api/v1/public/registration-requirements')
def requirements(db:Session=Depends(get_db)):
    version, settings = active(db)
    from app.config import get_settings
    collection_available=get_settings().app_env!='production' or bool(settings.get('document_retention_days'))
    return {'settings_version':version, **{k:settings.get(k,False if k.startswith('require_') else None) for k in service.REQUIREMENTS},
        'uploads_available':service.scan_available() and collection_available,'collection_available':collection_available,
        'scan_mode':'synthetic-test-only' if service.test_scanner_allowed() else 'clamav' if service.scan_available() else 'unavailable',
        'allowed_types':['image/png','image/jpeg'], 'max_file_bytes':service.MAX_FILE,
        'consent_version':CONSENT_VERSION,'consent_text':CONSENT_TEXT,
        'purpose':'Identity, residence and income evidence supports authorised membership review. Employment evidence does not guarantee future contributions.',
        'production_notice':'Retention, privacy approval, encrypted storage/backups and a current malware scanner are required before production document collection. Retention deletion is not automated.'}


@router.get(PREFIX+'/{application_id}', dependencies=[Depends(require('applications:read'))])
def detail(application_id:int, actor=Depends(require('documents:view')), db:Session=Depends(get_db)):
    return service.detail(db,application_id)


@router.get(PREFIX+'/{application_id}/{evidence_id}/download', dependencies=[Depends(require('applications:read'))])
def download(application_id:int, evidence_id:int, actor=Depends(protected('documents:view')), db:Session=Depends(get_db)):
    row = db.get(ApplicationEvidence,evidence_id)
    if not row or row.application_id != application_id:raise APIError(404,'not_found','Evidence not found')
    if not row.content:raise APIError(410,'retained_metadata','Document bytes were removed by an authorised retention operation; review history is retained')
    from app.models.audit_event import AuditEvent
    db.add(AuditEvent(event_type='documents',actor_user_id=actor.id,actor_email=actor.email,action='evidence_downloaded',target_table='application_evidence',target_id=str(row.id)))
    commit(db)
    extension = 'png' if row.content_type=='image/png' else 'jpg'
    return Response(row.content,media_type=row.content_type,headers={'Content-Disposition':f'attachment; filename="evidence-{row.id}.{extension}"',
        'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; sandbox"})


@router.post(PREFIX+'/{application_id}/replace', dependencies=[Depends(require('applications:read')),Depends(require('documents:view')),Depends(require('applications:assist'))])
def replace(application_id:int, body:EvidenceReplace, actor=Depends(protected('documents:replace')), db:Session=Depends(get_db)):
    service.replace(db,actor,application_id,body);commit(db);return {'completed':True}


@router.post(PREFIX+'/{application_id}/{evidence_id}/review', dependencies=[Depends(require('applications:read')),Depends(require('documents:view'))])
def review(application_id:int,evidence_id:int,body:EvidenceDecision,actor=Depends(protected('documents:review')),db:Session=Depends(get_db)):
    service.review(db,actor,application_id,evidence_id,body);commit(db);return {'completed':True}
