from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.models.evidence_enrolment import PlanApplication
from app.models.member import Member
from app.models.user import User
from app.security.auth import current_user, permissions, require
from app.routers.membership import protected, commit
from app.schemas.enrolment import PlanApply, PlanDecision, EnrolmentActivate
from app.services import enrolment as service

router=APIRouter(tags=['published plans and enrolment'])


@router.get('/api/v1/public/plan-offers')
def offers(category:str|None=Query(default=None,max_length=30),db:Session=Depends(get_db)):
    return {'items':service.offers(db,category)}


@router.get('/api/v1/member/plan-applications')
def owned(request:Request,actor=Depends(require('plans:own')),db:Session=Depends(get_db)):
    if request.query_params:raise APIError(400,'bad_request','Member selectors are not accepted')
    member=service.owned_member(db,actor)
    return {'items':[] if not member else [service.present_application(db,row) for row in db.query(PlanApplication).filter_by(member_id=member.id).order_by(PlanApplication.id.desc())]}


@router.post('/api/v1/member/plan-applications',status_code=201)
def apply(body:PlanApply,request:Request,actor=Depends(protected('plans:own')),db:Session=Depends(get_db)):
    if request.query_params:raise APIError(400,'bad_request','Member selectors are not accepted')
    result=service.apply(db,actor,body);commit(db);return result


@router.get('/api/v1/member/plan-applications/{identifier}')
def owned_detail(identifier:int,request:Request,actor=Depends(require('plans:own')),db:Session=Depends(get_db)):
    if request.query_params:raise APIError(400,'bad_request','Member selectors are not accepted')
    member=service.owned_member(db,actor)
    row=db.query(PlanApplication).filter_by(id=identifier,member_id=member.id).one_or_none() if member else None
    if not row:raise APIError(404,'not_found','Plan application not found')
    return service.present_application(db,row)


@router.get('/api/v1/review/plan-applications')
def listing(q:str=Query(default='',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),
    actor=Depends(require('plan-applications:review')),db:Session=Depends(get_db)):
    query=db.query(PlanApplication).join(Member,Member.id==PlanApplication.member_id)
    if q.strip():
        from sqlalchemy import or_
        query=query.filter(or_(Member.member_number.icontains(q.strip(),autoescape=True),Member.first_name.icontains(q.strip(),autoescape=True),Member.last_name.icontains(q.strip(),autoescape=True),PlanApplication.status.icontains(q.strip(),autoescape=True)))
    items=[]
    for row in query.order_by(PlanApplication.id.desc()).offset(skip).limit(limit):
        m=db.get(Member,row.member_id)
        items.append({**service.present_application(db,row),'member_name':m.first_name+' '+m.last_name,'member_number':m.member_number})
    return {'items':items,'total':query.count()}


@router.post('/api/v1/review/plan-applications/{identifier}/review')
def review(identifier:int,body:PlanDecision,actor=Depends(protected('plan-applications:review')),db:Session=Depends(get_db)):
    result=service.decide(db,actor,identifier,body);commit(db);return result


@router.post('/api/v1/review/plan-applications/{identifier}/activate',dependencies=[Depends(require('plan-applications:review'))])
def activate(identifier:int,body:EnrolmentActivate,actor=Depends(protected('enrolments:activate')),db:Session=Depends(get_db)):
    result=service.activate(db,actor,identifier);commit(db);return result
