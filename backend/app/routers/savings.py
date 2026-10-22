from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.security.auth import require, current_user, current_session, permissions
from app.services.membership import lock_actor
from app.routers.membership import commit
from app.models.savings import SavingsContribution
from app.models.evidence_enrolment import PlanApplication,PlanEnrolment
from app.models.member import Member
from app.models.contribution import Contribution as Legacy
from app.schemas.savings import Record,Decision
from app.services import savings as service

def parameters(request:Request):
    suffix=request.url.path.removeprefix('/api/v1/savings')
    allowed=({'q','status','skip','limit'} if not suffix else {'q','skip','limit'} if suffix=='/enrolments' else {'skip','limit'} if suffix=='/legacy' else set()) if request.method=='GET' else set()
    if any(key not in allowed or len(request.query_params.getlist(key))!=1 for key in request.query_params):
        service.fail('Unsupported parameters; member and actor identities come from the session',400)


router=APIRouter(prefix='/api/v1/savings',tags=['reconciled savings'],dependencies=[Depends(parameters)])


def office(code):
    def dependency(actor=Depends(require('savings:'+code))):
        if not actor.role or actor.role.name not in {'administrator','staff','finance'}:service.fail('Office savings permission required',403)
        return actor
    return dependency


def scope(db,actor):
    if 'savings:read' in permissions(db,actor) and actor.role.name in {'administrator','staff','finance'}:return None
    if actor.role.name!='member' or 'savings:own' not in permissions(db,actor):service.fail('Savings access denied',403)
    member=db.query(Member).filter_by(user_id=actor.id).one_or_none()
    return member.id if member else -1


@router.get('')
def listing(q:str=Query('',max_length=100),status:str=Query('',max_length=40),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor=Depends(current_user),db:Session=Depends(get_db)):
    member_id=scope(db,actor);query=db.query(SavingsContribution)
    if member_id is not None:query=query.filter_by(member_id=member_id)
    if q:query=query.filter(SavingsContribution.reference.ilike('%'+q.replace('%','\\%').replace('_','\\_')+'%',escape='\\'))
    if status:query=query.filter_by(status=status)
    return {'items':[service.present(db,r) for r in query.order_by(SavingsContribution.id.desc()).offset(skip).limit(limit)],'total':query.count(),'summary':service.summary(db,member_id)}


@router.get('/enrolments')
def enrolments(actor=Depends(office('record')),db:Session=Depends(get_db),q:str=Query('',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    query=db.query(PlanApplication,PlanEnrolment,Member).join(PlanEnrolment,PlanEnrolment.application_id==PlanApplication.id).join(Member,Member.id==PlanApplication.member_id).filter(PlanApplication.status=='Active')
    if q:query=query.filter(Member.member_number.ilike('%'+q+'%'))
    return {'items':[{'id':p.id,'member_number':m.member_number,'name':m.full_name,'currency':p.currency,'weekly_target':str(p.weekly_target),'start_date':e.start_date,'end_date':e.end_date} for p,e,m in query.order_by(PlanApplication.id).offset(skip).limit(limit)],'total':query.count()}


@router.get('/legacy')
def legacy(actor=Depends(office('read')),db:Session=Depends(get_db),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    query=db.query(Legacy)
    return {'items':[{'id':r.id,'reference':r.contribution_reference,'amount':str(r.amount),'currency':r.currency,'status':r.status,'notice':'Legacy record: not reconciled and excluded from the ledger. Historical mapping/reconciliation requires an approved migration workflow.'} for r in query.order_by(Legacy.id).offset(skip).limit(limit)],'total':query.count()}


@router.post('',status_code=201)
def record(body:Record,actor=Depends(office('record')),session=Depends(current_session),db:Session=Depends(get_db)):
    lock_actor(db,actor,session,'savings:record');result=service.record(db,actor,body);commit(db);return result


@router.get('/{identifier}')
def detail(identifier:int,actor=Depends(current_user),db:Session=Depends(get_db)):
    member_id=scope(db,actor);row=db.get(SavingsContribution,identifier)
    if not row or (member_id is not None and row.member_id!=member_id):service.fail('Contribution not found',404)
    return service.present(db,row)


@router.get('/{identifier}/receipt')
def receipt(identifier:int,actor=Depends(current_user),db:Session=Depends(get_db)):
    result=detail(identifier,actor,db)
    if not result['receipt_available']:service.fail('A pending or rejected contribution is not a confirmed receipt')
    return {'contribution':result,'notice':'Confirmed receipt' if result['status']=='Confirmed' else 'Reversed receipt: historical confirmation retained; this payment no longer increases savings.'}


@router.post('/{identifier}/{action}')
def decide(identifier:int,action:str,body:Decision,actor=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
    if action not in {'verify','reconcile','extra','reverse'}:service.fail('Action not found',404)
    if actor.role.name not in {'administrator','staff','finance'} or 'savings:'+action not in permissions(db,actor):service.fail('Separate savings action permission required',403)
    lock_actor(db,actor,session,'savings:'+action)
    result=service.action(db,actor,identifier,action,body);commit(db);return result
