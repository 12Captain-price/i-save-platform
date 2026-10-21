import json
from datetime import timezone
from fastapi import APIRouter,Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.models.fee_currency import FeeRateVersion as Version,FeeRatePublication as Publication
from app.models.audit_event import AuditEvent
from app.routers.plan_drafts import access
from app.routers.business_settings import locked
from app.schemas.fee_currency import RateSave,RatePublish
from app.security.auth import current_session,now,aware
from app.services.membership import advisory
from app.services.fee_currency import active_rate

router=APIRouter(prefix='/api/v1/admin/fee-rates',tags=['USD to ZiG fee rates'])


def presented(row):
    return {'version':row.id,'base_version':row.base_version,'rate':str(row.rate),'source':row.source,'actor_email':row.actor_email,'recorded_at':row.recorded_at}


def audit(db,actor,action,identifier,details):
    db.add(AuditEvent(event_type='fee_rate',actor_user_id=actor.id,actor_email=actor.email,action=action,target_table='fee_rate_versions',target_id=str(identifier),details=json.dumps(details)))


@router.get('')
def history(actor=Depends(access('settings:read')),db:Session=Depends(get_db)):
    rows=db.query(Version).order_by(Version.id.desc()).all();current=active_rate(db)
    pubs=db.query(Publication).order_by(Publication.effective_at.desc()).all()
    return {'head_version':rows[0].id if rows else 0,'active':presented(current) if current else None,'versions':[presented(r) for r in rows],
        'publications':[{'version':p.version_id,'effective_at':p.effective_at,'published_by':p.actor_email,'published_at':p.recorded_at} for p in pubs],
        'rounding':'Multiply the USD obligation by ZiG per USD, then round once to two decimal places using ROUND_HALF_UP. Full payments only. Savings conversion is unavailable.'}


@router.post('',status_code=201)
def save(body:RateSave,actor=Depends(access('settings:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    locked(db,actor,session,'settings:write');advisory(db,'fee-rates')
    old=db.query(Version).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if (old.base_version,old.rate,old.source)!=(body.base_version,body.rate,body.source):raise APIError(409,'conflict','Rate request key reused for a different draft')
        return presented(old)
    if body.base_version!=(db.query(func.max(Version.id)).scalar() or 0):raise APIError(409,'conflict','A newer rate draft exists. Reload.')
    row=Version(base_version=body.base_version,request_key=str(body.request_key),rate=body.rate,source=body.source,actor_id=actor.id,actor_email=actor.email)
    db.add(row);db.flush();audit(db,actor,'fee_rate_drafted',row.id,{'rate':str(row.rate),'source':row.source});db.commit();db.refresh(row)
    return presented(row)


@router.post('/publish')
def publish(body:RatePublish,actor=Depends(access('settings:publish')),session=Depends(current_session),db:Session=Depends(get_db)):
    locked(db,actor,session,'settings:publish');advisory(db,'fee-rates')
    fingerprint=json.dumps({'version':body.version_id,'effective_at':body.effective_at.isoformat() if body.effective_at else None},sort_keys=True)
    old=db.query(Publication).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.request_snapshot!=fingerprint:raise APIError(409,'conflict','Publication request key reused')
        return {'published':True,'version':old.version_id,'effective_at':old.effective_at}
    row=db.get(Version,body.version_id)
    if not row:raise APIError(404,'not_found','Rate draft not found')
    if row.id!=db.query(func.max(Version.id)).scalar():raise APIError(409,'conflict','Reload the latest rate draft')
    if db.query(Publication).filter_by(version_id=row.id).first():raise APIError(409,'conflict','Rate version already published')
    effective=body.effective_at.astimezone(timezone.utc) if body.effective_at else now()
    if body.effective_at and effective<now():raise APIError(400,'bad_date','Cannot backdate a rate')
    last=db.query(func.max(Publication.effective_at)).scalar()
    if last and effective<=aware(last):raise APIError(409,'conflict','Effective date must follow the latest scheduled rate publication')
    db.add(Publication(version_id=row.id,request_key=str(body.request_key),request_snapshot=fingerprint,effective_at=effective,actor_id=actor.id,actor_email=actor.email))
    audit(db,actor,'fee_rate_published',row.id,{'rate':str(row.rate),'source':row.source,'effective_at':effective.isoformat()});db.commit()
    return {'published':True,'version':row.id,'effective_at':effective}
