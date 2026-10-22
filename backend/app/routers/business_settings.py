import json
from datetime import timezone
from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, update
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.models.business_settings import BusinessSettingsVersion as Version, BusinessSettingsPublication as Publication
from app.models.audit_event import AuditEvent
from app.routers.plan_drafts import access
from app.schemas.business_settings import SettingsSave, SettingsPublish, BusinessTerms
from app.security.auth import current_session, now, aware
from app.services.membership import lock_actor, advisory
from app.services.business_settings import active, public_contacts

router = APIRouter(tags=['organisation settings'])
PREFIX = '/api/v1/admin/organisation-settings'
IMPACTS = {
    'contacts': 'Public Contact, footer, registration help and application follow-up use the effective published contacts on their next load. Publishing does not send email.',
    'registration': 'Future first payment recordings snapshot the fee amount/currency and reviewer wording. Existing recorded payments and their approval requirements do not change.',
    'subscriptions': 'Future activations create their first subscription obligation using the effective amount, currency and optional due day. Existing obligations and activation start months do not change. Recurring obligation generation is not enabled.',
    'review': 'Future first payment recordings snapshot reviewer wording. Verified fee and explicit acknowledgement remain mandatory. Document requirements are snapshotted at new application submission; existing applications are not retrospectively verified or subjected to new document requirements. Retention is a recorded policy decision only; automatic deletion is not implemented.',
}


def latest_id(db):
    return db.query(func.max(Version.id)).scalar() or 0


def presented(row):
    terms = BusinessTerms.model_validate_json(row.snapshot)
    return {'version':row.id, 'base_version':row.base_version, 'terms':terms.model_dump(mode='json'),
            'missing_decisions':terms.missing(), 'actor_email':row.actor_email, 'recorded_at':row.recorded_at}


def blockers(db, row):
    terms = json.loads(row.snapshot)
    missing = BusinessTerms.model_validate(terms).missing()
    reasons = ['Missing decision: '+key.replace('_',' ') for key in missing]
    _, previous = active(db)
    if any(terms[k]!=previous[k] for k in ['registration_amount','registration_currency']) and terms['review_acknowledgement']==previous['review_acknowledgement']:
        reasons.append('The fee changed. Update reviewer wording to match before publication.')
    return reasons


def audit(db, actor, action, identifier, details):
    db.add(AuditEvent(event_type='organisation_settings', actor_user_id=actor.id, actor_email=actor.email,
        action=action, target_table='business_settings_versions', target_id=str(identifier), details=json.dumps(details)))


def locked(db, actor, session, code):
    if db.bind.dialect.name=='sqlite':
        from app.models.user import User
        db.execute(update(User).where(User.id==actor.id).values(is_active=User.is_active,updated_at=User.updated_at))
    lock_actor(db, actor, session, code)
    advisory(db, 'organisation-settings')


@router.get('/api/v1/public/contacts')
def contacts(response:Response, db:Session=Depends(get_db)):
    response.headers['Cache-Control']='no-store'
    return public_contacts(db)


@router.get(PREFIX)
def history(actor=Depends(access('settings:read')), db:Session=Depends(get_db)):
    versions = db.query(Version).order_by(Version.id.desc()).all()
    publications = db.query(Publication).order_by(Publication.effective_at.desc()).all()
    current, terms = active(db)
    return {'active_version':current, 'active_terms':terms, 'head_version':latest_id(db),
        'versions':[presented(v) for v in versions],
        'publications':[{'version':p.version_id,'effective_at':p.effective_at,'actor_email':p.actor_email,'recorded_at':p.recorded_at} for p in publications],
        'impacts':IMPACTS, 'unsupported':['Withdrawals','Refunds','Returns','Penalties','Automated recurring billing','Automatic document deletion / retention enforcement','Additional eligibility rules','SMTP credentials and infrastructure'],
        'preview':None if not versions else {'version':versions[0].id, 'blockers':blockers(db,versions[0]),
            'changes':{k:{'from':terms[k],'to':v} for k,v in json.loads(versions[0].snapshot).items() if v!=terms[k]}}}


@router.post(PREFIX, status_code=201)
def save(body:SettingsSave, actor=Depends(access('settings:write')), session=Depends(current_session), db:Session=Depends(get_db)):
    locked(db,actor,session,'settings:write')
    snapshot = json.dumps(body.terms.model_dump(mode='json'),sort_keys=True)
    old = db.query(Version).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.snapshot!=snapshot or old.base_version!=body.base_version:raise APIError(409,'conflict','Request key used for different settings')
        return presented(old)
    if body.base_version!=latest_id(db):raise APIError(409,'conflict','Settings changed. Reload before editing.')
    row = Version(base_version=body.base_version,request_key=str(body.request_key),snapshot=snapshot,actor_id=actor.id,actor_email=actor.email)
    db.add(row); db.flush()
    audit(db,actor,'organisation_settings_drafted',row.id,{'base_version':body.base_version})
    db.commit(); db.refresh(row)
    return presented(row)


@router.post(PREFIX+'/publish')
def publish(body:SettingsPublish, actor=Depends(access('settings:publish')), session=Depends(current_session), db:Session=Depends(get_db)):
    locked(db,actor,session,'settings:publish')
    request_snapshot=json.dumps({'version_id':body.version_id,'effective_at':body.effective_at.isoformat() if body.effective_at else None},sort_keys=True)
    old = db.query(Publication).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.request_snapshot!=request_snapshot:
            raise APIError(409,'conflict','Publication request key reused')
        return {'published':True,'version':old.version_id,'effective_at':old.effective_at}
    row = db.get(Version,body.version_id)
    if not row:raise APIError(404,'not_found','Version not found')
    if body.version_id!=latest_id(db):raise APIError(409,'conflict','A newer draft exists. Reload the preview.')
    reasons = blockers(db,row)
    if reasons:raise APIError(400,'incomplete_settings','; '.join(reasons))
    if db.query(Publication).filter_by(version_id=row.id).first():raise APIError(409,'conflict','Version already published')
    effective = body.effective_at.astimezone(timezone.utc) if body.effective_at else now()
    last = db.query(func.max(Publication.effective_at)).scalar()
    if effective<now() and body.effective_at is not None:raise APIError(400,'bad_effective_date','Cannot backdate publication')
    if last and effective<=aware(last):raise APIError(409,'conflict','Effective date must follow the latest scheduled publication')
    publication = Publication(version_id=row.id,request_key=str(body.request_key),request_snapshot=request_snapshot,effective_at=effective,actor_id=actor.id,actor_email=actor.email)
    db.add(publication); audit(db,actor,'organisation_settings_published',row.id,{'effective_at':effective.isoformat()})
    db.commit()
    return {'published':True,'version':row.id,'effective_at':effective}
