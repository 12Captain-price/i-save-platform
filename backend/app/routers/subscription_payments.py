from fastapi import APIRouter,Depends,Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError,not_found
from app.models.subscription import Subscription
from app.models.member import Member
from app.models.fee_currency import FeeObligation,SubscriptionFeePayment
from app.models.business_settings import SubscriptionSettingsSnapshot
from app.security.auth import require,current_user,permissions
from app.routers.membership import protected,commit,EmptyAction
from app.schemas.membership import PaymentRecord
from app.services import fee_currency as service

router=APIRouter(prefix='/api/v1/membership/subscriptions',tags=['subscription fee payments'])


def reader(actor=Depends(require('subscriptions:read'))):
    if not actor.role or actor.role.name not in {'administrator','staff','finance'}:raise APIError(403,'forbidden','Authorised fee reviewer required')
    return actor


def detail(db,subscription):
    member=db.get(Member,subscription.member_id)
    payment=db.get(SubscriptionFeePayment,subscription.id)
    obligation=db.query(FeeObligation).filter_by(subscription_id=subscription.id).one_or_none()
    return {'id':subscription.id,'member_number':member.member_number,'member_name':member.first_name+' '+member.last_name,'period_month':subscription.period_month,
        'amount':str(subscription.amount),'currency':subscription.currency,'status':subscription.status,'due_date':subscription.due_date if db.get(SubscriptionSettingsSnapshot,subscription.id) else None,'payment_status':'Paid' if payment and payment.verified_at else 'Pending verification' if payment else 'Unpaid' if subscription.status=='Pending' else 'Legacy status requires review','obligation':service.quote(db,obligation),
        'payment':None if not payment else {'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':payment.payment_date,'recorded_by':payment.recorder_email,'recorded_at':payment.recorded_at,'verified_by':payment.verifier_email,'verified_at':payment.verified_at}}


@router.get('')
def listing(skip:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),q:str=Query('',max_length=100),status:str=Query('',pattern=r'^(|Unpaid|Pending verification|Paid)$'),actor=Depends(reader),db:Session=Depends(get_db)):
    query=db.query(Subscription)
    if q:
        from sqlalchemy import or_
        escaped='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        query=query.join(Member,Member.id==Subscription.member_id).outerjoin(SubscriptionFeePayment,SubscriptionFeePayment.subscription_id==Subscription.id).filter(or_(Member.member_number.ilike(escaped,escape='\\'),Member.first_name.ilike(escaped,escape='\\'),Member.last_name.ilike(escaped,escape='\\'),Subscription.period_month.ilike(escaped,escape='\\'),SubscriptionFeePayment.reference.ilike(escaped,escape='\\')))
    payments=db.query(SubscriptionFeePayment.subscription_id)
    if status=='Unpaid':query=query.filter(Subscription.status=='Pending',Subscription.id.notin_(payments))
    elif status=='Pending verification':query=query.filter(Subscription.id.in_(payments.filter(SubscriptionFeePayment.verified_at.is_(None))))
    elif status=='Paid':query=query.filter(Subscription.id.in_(payments.filter(SubscriptionFeePayment.verified_at.is_not(None))))
    return {'total':query.count(),'items':[detail(db,s) for s in query.order_by(Subscription.id.desc()).offset(skip).limit(limit)]}


@router.post('/{identifier}/payment')
def record(identifier:int,body:PaymentRecord,actor=Depends(protected('subscription-fees:record')),db:Session=Depends(get_db)):
    service.subscription_payment(db,actor,identifier,body);commit(db);return {'completed':True}


@router.post('/{identifier}/verify')
def verify(identifier:int,body:EmptyAction,actor=Depends(protected('subscription-fees:verify')),db:Session=Depends(get_db)):
    service.verify_subscription(db,actor,identifier);commit(db);return {'completed':True}
