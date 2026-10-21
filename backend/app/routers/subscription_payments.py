from fastapi import APIRouter,Depends,Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError,not_found
from app.models.subscription import Subscription
from app.models.member import Member
from app.models.fee_currency import FeeObligation,SubscriptionFeePayment
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
        'amount':str(subscription.amount),'currency':subscription.currency,'status':subscription.status,'obligation':service.quote(db,obligation),
        'payment':None if not payment else {'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':payment.payment_date,'recorded_by':payment.recorder_email,'recorded_at':payment.recorded_at,'verified_by':payment.verifier_email,'verified_at':payment.verified_at}}


@router.get('')
def listing(skip:int=Query(0,ge=0),limit:int=Query(10,ge=1,le=100),actor=Depends(reader),db:Session=Depends(get_db)):
    query=db.query(Subscription)
    return {'total':query.count(),'items':[detail(db,s) for s in query.order_by(Subscription.id.desc()).offset(skip).limit(limit)]}


@router.post('/{identifier}/payment')
def record(identifier:int,body:PaymentRecord,actor=Depends(protected('subscription-fees:record')),db:Session=Depends(get_db)):
    service.subscription_payment(db,actor,identifier,body);commit(db);return {'completed':True}


@router.post('/{identifier}/verify')
def verify(identifier:int,body:EmptyAction,actor=Depends(protected('subscription-fees:verify')),db:Session=Depends(get_db)):
    service.verify_subscription(db,actor,identifier);commit(db);return {'completed':True}
