"""Distinct retention scopes and operational metadata. No live restore API."""
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from sqlalchemy import select, func
from app.models.operations import OperationsPolicy as Policy, OperationsEvent as Event, BackupJob
from app.models.application import MembershipApplication
from app.models.evidence_enrolment import ApplicationEvidence, RegistrationEvidenceProfile
from app.exceptions import APIError
from app.security.auth import now, aware
from app.services.membership import advisory
from app.config import get_settings

SCOPES = {'evidence_days': 'Superseded private evidence bytes on rejected applications only; review history and hashes remain.',
          'identity_days': 'National ID field on rejected applications only; account, application and audit records remain.',
          'backup_interval_hours': 'Queue an encrypted local backup at this interval. Unset means no scheduled jobs. Existing archives are never automatically deleted.'}


def encoded(value): return json.dumps(value, sort_keys=True, default=str)


def event(db, actor, action, target, data, key):
    row=Event(action=action,target=str(target),snapshot=encoded(data),request_key=str(key),actor_id=actor.id if actor else None,actor_email=actor.email if actor else None)
    db.add(row);db.flush();return row


def active(db, at=None):
    for row in db.query(Event).filter_by(action='publish').order_by(Event.id.desc()):
        data=json.loads(row.snapshot)
        if aware(datetime.fromisoformat(data['effective_at'])) <= (at or now()):
            policy=db.get(Policy,int(row.target));return policy.id,json.loads(policy.snapshot)
    return 0, {'evidence_days':None,'identity_days':None,'backup_interval_hours':None}


def save(db, actor, body):
    advisory(db,'operations-policy')
    snapshot=encoded(body.terms.model_dump())
    old=db.query(Policy).filter_by(request_key=str(body.request_key)).first()
    if old:
        if old.actor_id!=actor.id or old.snapshot!=snapshot or old.base_version!=body.base_version:raise APIError(409,'conflict','Request key reused')
        return old
    if body.base_version!=(db.query(func.max(Policy.id)).scalar() or 0):raise APIError(409,'conflict','Draft changed; reload before saving')
    row=Policy(base_version=body.base_version,snapshot=snapshot,request_key=str(body.request_key),actor_id=actor.id,actor_email=actor.email)
    db.add(row);db.flush();event(db,actor,'draft',row.id,{'base_version':body.base_version},'draft:'+str(body.request_key));return row


def publish(db,actor,body):
    advisory(db,'retention-execution');advisory(db,'operations-policy')
    old=db.query(Event).filter_by(request_key=str(body.request_key)).first()
    if old:
        data=json.loads(old.snapshot)
        if old.action!='publish' or old.target!=str(body.version) or old.actor_id!=actor.id or data['requested_effective_at']!=(body.effective_at.isoformat() if body.effective_at else None):raise APIError(409,'conflict','Request key reused')
        return
    if body.version!=(db.query(func.max(Policy.id)).scalar() or 0):raise APIError(409,'conflict','A newer draft exists; reload')
    if db.query(Event).filter_by(action='publish',target=str(body.version)).first():raise APIError(409,'conflict','Already published')
    effective=body.effective_at or now()
    if body.effective_at and effective<now():raise APIError(400,'date','Cannot backdate policy')
    latest=db.query(Event).filter_by(action='publish').order_by(Event.id.desc()).first()
    if latest and effective<=aware(datetime.fromisoformat(json.loads(latest.snapshot)['effective_at'])):raise APIError(409,'date','Effective time must follow scheduled publication')
    event(db,actor,'publish',body.version,{'effective_at':effective.isoformat(),'requested_effective_at':body.effective_at.isoformat() if body.effective_at else None},body.request_key)


def holds(db):
    result={}
    for row in db.query(Event).filter_by(action='hold').order_by(Event.id):result[int(row.target)]={'event_id':row.id,**json.loads(row.snapshot)}
    return result


def hold(db,actor,body):
    advisory(db,'retention-execution')
    old=db.query(Event).filter_by(request_key=str(body.request_key)).first()
    data={'enabled':body.enabled,'reason':body.reason,'base_event':body.base_event}
    if old:
        if old.actor_id!=actor.id or old.action!='hold' or old.target!=str(body.application_id) or old.snapshot!=encoded(data):raise APIError(409,'conflict','Request key reused')
        return
    if not db.get(MembershipApplication,body.application_id):raise APIError(404,'not_found','Application not found')
    if holds(db).get(body.application_id,{}).get('event_id',0)!=body.base_event:raise APIError(409,'conflict','Legal hold changed; reload')
    event(db,actor,'hold',body.application_id,data,body.request_key)


def preview(db, lock=False):
    version,terms=active(db);held=holds(db);evidence=[];identity=[]
    erased={r.target for r in db.query(Event).filter_by(action='erase')}
    applications=db.query(MembershipApplication).filter_by(status='Rejected').order_by(MembershipApplication.id)
    if lock:applications=applications.with_for_update().execution_options(populate_existing=True)
    for app in applications:
        if held.get(app.id,{}).get('enabled') or not app.reviewed_at:continue
        closed=aware(app.reviewed_at)
        rows=db.query(ApplicationEvidence).filter_by(application_id=app.id).all();replaced={r.replaces_id for r in rows if r.replaces_id}
        if terms['evidence_days'] and closed+timedelta(days=terms['evidence_days'])<=now():
            evidence += [r.id for r in rows if r.id in replaced and r.content and 'evidence:'+str(r.id) not in erased and aware(r.recorded_at)+timedelta(days=terms['evidence_days'])<=now()]
        profile=db.get(RegistrationEvidenceProfile,app.id)
        if terms['identity_days'] and closed+timedelta(days=terms['identity_days'])<=now() and profile and profile.national_id and 'identity:'+str(app.id) not in erased:identity.append(app.id)
    data={'policy_version':version,'evidence_ids':sorted(evidence),'identity_application_ids':identity,'holds':held}
    digest=hmac.new(get_settings().secret_key.encode(),encoded(data).encode(),hashlib.sha256).hexdigest()
    from sqlalchemy.engine import make_url
    settings=get_settings();allowed=settings.app_env=='test' and (make_url(settings.database_url).database or '').startswith('isave_test_')
    return {**data,'preview_digest':digest,'execution_available':allowed,'notice':'Only isolated synthetic deletion is enabled. Unset periods delete nothing. Financial, account, current evidence, review and audit history are excluded. Backups may retain removed bytes until an approved archive-disposal process exists.'}


def erase(db,actor,body):
    advisory(db,'retention-execution');advisory(db,'operations-policy')
    old=db.query(Event).filter_by(request_key='run:'+str(body.request_key)).first()
    if old:
        if old.actor_id!=actor.id or json.loads(old.snapshot)!={'digest':body.preview_digest,'reason':body.reason}:raise APIError(409,'conflict','Request key reused')
        return
    p=preview(db,lock=True)
    if not p['execution_available']:raise APIError(403,'disabled','Destructive retention execution is restricted to isolated synthetic tests')
    if not hmac.compare_digest(body.preview_digest,p['preview_digest']):raise APIError(409,'stale_preview','Eligible records or policy changed; preview again')
    for identifier in p['evidence_ids']:
        row=db.get(ApplicationEvidence,identifier);row.content=b''
        event(db,actor,'erase','evidence:'+str(identifier),{'policy_version':p['policy_version'],'reason':body.reason,'original_sha256':row.sha256},'erase:'+str(body.request_key)+':e:'+str(identifier))
    for identifier in p['identity_application_ids']:
        db.get(RegistrationEvidenceProfile,identifier).national_id=None
        event(db,actor,'erase','identity:'+str(identifier),{'policy_version':p['policy_version'],'reason':body.reason},'erase:'+str(body.request_key)+':i:'+str(identifier))
    event(db,actor,'retention_run','retention',{'digest':body.preview_digest,'reason':body.reason},'run:'+str(body.request_key))


def queue(db,actor,body):
    advisory(db,'backup-queue')
    old=db.query(BackupJob).filter_by(request_key=str(body.request_key)).first()
    if old:
        if old.kind!=body.kind or old.backup_id!=body.backup_id or old.actor_id!=(actor.id if actor else None):raise APIError(409,'conflict','Request key reused')
        return old
    if body.kind=='restore-test':
        backup=db.get(BackupJob,body.backup_id)
        if not backup or backup.kind!='backup' or backup.state!='Succeeded':raise APIError(400,'backup','Select a successful backup')
    row=BackupJob(kind=body.kind,backup_id=body.backup_id,request_key=str(body.request_key),actor_id=actor.id if actor else None,actor_email=actor.email if actor else None)
    db.add(row);db.flush();event(db,actor,'backup_queued',row.id,{'kind':body.kind,'backup_id':body.backup_id},'job:'+str(body.request_key));return row
