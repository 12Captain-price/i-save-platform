"""Admin-only drafting; no publication or financial side effects exist here."""
import json
from fastapi import APIRouter,Depends,Query
from sqlalchemy import select,update
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.exceptions import APIError
from app.models.plan_draft import PlanDraft,PlanDraftVersion
from app.models.user import User
from app.models.audit_event import AuditEvent
from app.schemas.plan_draft import DraftSave,DraftTerms
from app.security.auth import current_user,current_session,permissions
from app.services.membership import lock_actor,advisory

router=APIRouter(prefix='/api/v1/admin/plan-drafts',tags=['unpublished plan drafts'])


def access(code):
    def check(actor:User=Depends(current_user),db:Session=Depends(get_db)):
        if not actor.role or actor.role.name!='administrator' or code not in permissions(db,actor):
            raise APIError(403,'forbidden','Administrator draft permission required')
        return actor
    return check


def present(row):
    terms=DraftTerms.model_validate_json(row.snapshot)
    return {'draft_id':row.draft_id,'version':row.version,'terms':terms.model_dump(mode='json'),
        'missing_decisions':terms.missing(),'status':'Unpublished draft','actor_email':row.actor_email,
        'recorded_at':row.recorded_at}


@router.get('')
def listing(skip:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),actor=Depends(access('plans:drafts:read')),db:Session=Depends(get_db)):
    query=db.query(PlanDraftVersion).join(PlanDraft,PlanDraft.id==PlanDraftVersion.draft_id).filter(PlanDraftVersion.version==PlanDraft.latest_version)
    return {'items':[present(v) for v in query.order_by(PlanDraft.id.desc()).offset(skip).limit(limit)],'total':query.count()}


@router.get('/{draft_id}')
def detail(draft_id:int,actor=Depends(access('plans:drafts:read')),db:Session=Depends(get_db)):
    rows=db.query(PlanDraftVersion).filter_by(draft_id=draft_id).order_by(PlanDraftVersion.version.desc()).all()
    if not rows:raise APIError(404,'not_found','Draft not found')
    return {'latest':present(rows[0]),'history':[present(r) for r in rows]}


def save(db,actor,session,body,draft_id=None):
    lock_actor(db,actor,session,'plans:drafts:write')
    if not actor.role or actor.role.name!='administrator':raise APIError(403,'forbidden','Administrator required')
    if draft_id is None and body.base_version!=0:raise APIError(409,'conflict','New draft starts at version zero')
    key=str(body.request_key);advisory(db,'plan-draft-request:'+key)
    snapshot=json.dumps(body.terms.model_dump(mode='json'),sort_keys=True)
    old=db.query(PlanDraftVersion).filter_by(request_key=key).one_or_none()
    if old:
        if old.snapshot!=snapshot or (draft_id is not None and old.draft_id!=draft_id) or old.version!=body.base_version+1:
            raise APIError(409,'conflict','Request key already used for a different change')
        return present(old)
    if draft_id is None:
        if body.base_version!=0:raise APIError(409,'conflict','New draft starts at version zero')
        draft=PlanDraft(latest_version=0);db.add(draft);db.flush()
    else:
        if db.bind.dialect.name=='sqlite':db.execute(update(PlanDraft).where(PlanDraft.id==draft_id).values(latest_version=PlanDraft.latest_version))
        draft=db.execute(select(PlanDraft).where(PlanDraft.id==draft_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
        if not draft:raise APIError(404,'not_found','Draft not found')
    if draft.latest_version!=body.base_version:raise APIError(409,'conflict','Draft changed; reload before saving')
    draft.latest_version+=1
    row=PlanDraftVersion(draft_id=draft.id,version=draft.latest_version,request_key=key,snapshot=snapshot,actor_id=actor.id,actor_email=actor.email)
    db.add(row)
    db.add(AuditEvent(event_type='plan_draft',actor_user_id=actor.id,actor_email=actor.email,action='plan_draft_created' if draft.latest_version==1 else 'plan_draft_revised',target_table='plan_drafts',target_id=str(draft.id),details=json.dumps({'version':draft.latest_version,'status':'Unpublished draft'})))
    try:db.commit()
    except IntegrityError:
        db.rollback();raise APIError(409,'conflict','Conflicting draft change; reload before retrying')
    db.refresh(row);return present(row)


@router.post('',status_code=201)
def create(body:DraftSave,actor=Depends(access('plans:drafts:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    return save(db,actor,session,body)


@router.put('/{draft_id}')
def revise(draft_id:int,body:DraftSave,actor=Depends(access('plans:drafts:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    return save(db,actor,session,body,draft_id)
