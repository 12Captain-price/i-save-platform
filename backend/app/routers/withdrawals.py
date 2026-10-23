from fastapi import APIRouter,Depends,Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.security.auth import current_user,require,permissions,current_session
from app.models.member import Member
from app.models.evidence_enrolment import PlanApplication,PlanEnrolment
from app.models.withdrawal import WithdrawalRequest
from app.services import withdrawals as service
from app.services.membership import lock_actor
from app.routers.membership import commit
from app.schemas.withdrawal import RequestWithdrawal,WithdrawalDecision

router=APIRouter(prefix='/api/v1/withdrawals',tags=['withdrawals'])


def scope(db,actor):
    codes=permissions(db,actor)
    if actor.role and actor.role.name=='member' and 'withdrawals:own' in codes:
        member=db.query(Member).filter_by(user_id=actor.id).one_or_none()
        return member.id if member else -1
    if actor.role and actor.role.name in {'administrator','staff','finance'} and 'withdrawals:read' in codes:return None
    service.fail('Withdrawal access permission required',403)


@router.get('/eligibility')
def eligibility(actor=Depends(current_user),db:Session=Depends(get_db)):
    member_id=scope(db,actor)
    if member_id is None:service.fail('Member-owned enrolment access required',403)
    rows=db.query(PlanApplication,PlanEnrolment).join(PlanEnrolment,PlanEnrolment.application_id==PlanApplication.id).filter(PlanApplication.member_id==member_id)
    return {'items':[service.eligibility(db,p,e) for p,e in rows]}


@router.get('')
def listing(q:str=Query('',max_length=100),status:str=Query('',pattern=r'^(|Requested|Approved|Processing|Recorded|Uncertain|Rejected|Cancelled|Failed|Paid)$'),skip:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),actor=Depends(current_user),db:Session=Depends(get_db)):
    member_id=scope(db,actor);query=db.query(WithdrawalRequest)
    if member_id is not None:query=query.filter_by(member_id=member_id)
    if status:query=query.filter_by(status=status)
    if q:
        escaped='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        query=query.join(Member,Member.id==WithdrawalRequest.member_id).filter(Member.member_number.ilike(escaped,escape='\\'))
    return {'items':[service.present(db,r) for r in query.order_by(WithdrawalRequest.id.desc()).offset(skip).limit(limit)],'total':query.count()}


@router.get('/{identifier}')
def detail(identifier:int,actor=Depends(current_user),db:Session=Depends(get_db)):
    member_id=scope(db,actor);row=db.get(WithdrawalRequest,identifier)
    if not row or member_id is not None and row.member_id!=member_id:service.fail('Withdrawal not found',404)
    return service.present(db,row)


@router.get('/{identifier}/receipt')
def receipt(identifier:int,actor=Depends(current_user),db:Session=Depends(get_db)):
    row=detail(identifier,actor,db)
    if not row['receipt_available']:service.fail('A reservation or unverified payout is not a paid receipt')
    return {'withdrawal':row,'notice':'Verified manual payout receipt; linked ledger debit retained. No external provider transfer is claimed.'}


@router.post('',status_code=201)
def request(body:RequestWithdrawal,actor=Depends(require('withdrawals:own')),session=Depends(current_session),db:Session=Depends(get_db)):
    if not actor.role or actor.role.name!='member':service.fail('Member account required',403)
    lock_actor(db,actor,session,'withdrawals:own')
    result=service.request(db,actor,body);commit(db);return result


@router.post('/{identifier}/{action}')
def action(identifier:int,action:str,body:WithdrawalDecision,actor=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
    member=actor.role and actor.role.name=='member'
    code='withdrawals:own' if action=='cancel' and member else 'withdrawals:'+{'approve':'approve','reject':'approve','process':'process','record':'process','uncertain':'process','not_paid':'verify','verify':'verify','cancel':'approve'}.get(action,'invalid')
    if member:
        if action!='cancel':service.fail('Office action permission required',403)
        detail(identifier,actor,db)
    elif not actor.role or actor.role.name not in {'administrator','staff','finance'}:service.fail('Authorised office role required',403)
    lock_actor(db,actor,session,code)
    result=service.action(db,actor,identifier,action,body);commit(db);return result
