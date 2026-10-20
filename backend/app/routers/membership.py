from fastapi import APIRouter,Depends
from pydantic import BaseModel,ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.models.auth import AuthSession
from app.models.user import User
from app.models.member import Member
from app.models.membership import ApplicationRegistrationPayment as Payment,MembershipApproval as Approval,PasswordSetupInvitation as Invitation
from app.models.registration_fee import RegistrationFee
from app.models.subscription import Subscription
from app.security.auth import current_session,require,current_user,permissions,digest
from app.services.auth import throttle
from app.services import membership as service
from app.services.invitation_delivery import get_invitation_mailer
from app.schemas.membership import PaymentRecord,ReviewAcknowledgement,InvitationRequest

router=APIRouter(prefix='/api/v1/membership',tags=['membership workflow'])


class EmptyAction(BaseModel):
    model_config=ConfigDict(extra='forbid')


def protected(code):
    def dependency(actor:User=Depends(require(code)),session:AuthSession=Depends(current_session),db:Session=Depends(get_db)):
        if code=='invitations:issue':throttle(db,digest('invitation-issue:'+str(actor.id)))
        service.lock_actor(db,actor,session,code)
        return actor
    return dependency


def commit(db):
    try:db.commit()
    except IntegrityError:
        db.rollback();raise APIError(409,'conflict','A conflicting record already exists; refresh before retrying')


@router.get('/applications/{application_id}',dependencies=[Depends(require('applications:read'))])
def state(application_id:int,actor:User=Depends(current_user),db:Session=Depends(get_db),mailer=Depends(get_invitation_mailer)):
    result=service.workflow(db,actor,application_id,mailer.available)
    result['delivery']['mode']=getattr(mailer,'mode','unavailable')
    return result


@router.post('/applications/{application_id}/payment')
def record(application_id:int,body:PaymentRecord,actor:User=Depends(protected('registration-fees:record')),db:Session=Depends(get_db)):
    service.record_payment(db,actor,application_id,body);commit(db);return {'completed':True}


@router.post('/applications/{application_id}/verify')
def verify(application_id:int,body:EmptyAction,actor:User=Depends(protected('registration-fees:verify')),db:Session=Depends(get_db)):
    service.verify_payment(db,actor,application_id);commit(db);return {'completed':True}


@router.post('/applications/{application_id}/approve')
def approve(application_id:int,body:ReviewAcknowledgement,actor:User=Depends(protected('membership:approve')),db:Session=Depends(get_db)):
    service.approve(db,actor,application_id);commit(db);return {'completed':True}


@router.post('/applications/{application_id}/activate')
def activate(application_id:int,body:EmptyAction,actor:User=Depends(protected('membership:activate')),db:Session=Depends(get_db)):
    service.activate(db,actor,application_id);commit(db);return {'completed':True}


@router.post('/applications/{application_id}/invitation')
def invitation(application_id:int,body:InvitationRequest,actor:User=Depends(protected('invitations:issue')),db:Session=Depends(get_db),mailer=Depends(get_invitation_mailer)):
    service.lock_application(db,application_id)
    if not mailer.available:raise APIError(503,'delivery_unavailable','Invitation delivery unavailable: approved provider, sender, credentials and HTTPS setup URL are required')
    old=db.query(Invitation).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.application_id!=application_id:raise APIError(409,'conflict','Invitation request key is already used')
        if old.delivery_state not in {'Provider accepted','Mailpit accepted'}:
            raise APIError(409,'delivery_not_retried','This attempt is unconfirmed and will not be resent. Refresh and explicitly request a replacement.')
        return {'delivery':old.delivery_state,'provider_message_id':old.provider_message_id}
    token,row=service.create_invitation(db,actor,application_id,body.request_key)
    row.delivery_state='Sending'
    # Reserve the request key durably BEFORE the external side effect. A crash
    # or uncertain SMTP outcome must never cause automatic resend on retry.
    token_hash=row.token_hash
    commit(db)
    try:
        proof=mailer.send(recipient=db.get(User,row.user_id).email,token=token,request_key=str(body.request_key))
        if not isinstance(proof,str) or not proof.strip() or len(proof)>255 or token in proof:raise RuntimeError('No safe provider acceptance evidence')
    except Exception:
        db.rollback()
        row=db.get(Invitation,token_hash)
        row.delivery_state='Unconfirmed - not retried';row.revoked_at=service.now()
        app=service.lock_application(db,application_id)
        service.event(db,actor,'password_setup_invitation_delivery_unconfirmed',app,'Delivery unconfirmed; attempt revoked and will not be resent automatically. No membership/payment change.')
        commit(db)
        raise APIError(503,'delivery_unconfirmed','Delivery unconfirmed. Refresh and explicitly request a replacement; this attempt will not be resent.')
    # Another explicit replacement may have revoked this attempt while SMTP
    # was running. Do not clear its revocation or reactivate an old token.
    row=db.get(Invitation,token_hash);db.refresh(row)
    local=getattr(mailer,'mode',None)=='mailpit'
    row.provider_message_id=proof;row.delivery_state='Mailpit accepted' if local else 'Provider accepted'
    app=service.lock_application(db,application_id)
    service.event(db,actor,'password_setup_invitation_delivery_accepted',app,'Mailpit accepted a local test message; no external email delivery.' if local else 'Email provider accepted the password setup invitation; inbox delivery is not guaranteed.',{'provider_message_id':proof})
    commit(db);return {'delivery':row.delivery_state,'provider_message_id':proof}


@router.get('/fees')
def member_fees(actor:User=Depends(current_user),db:Session=Depends(get_db)):
    codes=permissions(db,actor)
    if 'fees:own' not in codes:raise APIError(403,'forbidden','Member fee access required')
    member=db.query(Member).filter_by(user_id=actor.id).one_or_none()
    if not member:return {'registration_fees':[],'subscriptions':[]}
    result=[]
    for payment,approval in db.execute(select(Payment,Approval).join(Approval,Approval.application_id==Payment.application_id).where(Payment.member_id==member.id,Approval.member_id==member.id,Approval.activated_at.is_not(None))):
        if service.verified(payment):result.append({'amount':str(payment.amount),'currency':payment.currency,'status':'Paid','reference':payment.reference,'payment_date':payment.payment_date,'verified_at':payment.verified_at})
    # Preserve separately recorded historical fees without copying them into the new payment table.
    for old in db.query(RegistrationFee).filter_by(member_id=member.id).all():
        result.append({'amount':str(old.amount),'currency':old.currency,'status':old.status,'reference':old.fee_reference,'payment_date':old.paid_at.date() if old.paid_at else None,'verified_at':None})
    subscriptions=[{'amount':str(s.amount),'currency':s.currency,'period_month':s.period_month,'status':s.status,'due_date':s.due_date} for s in db.query(Subscription).filter_by(member_id=member.id).order_by(Subscription.period_month).all()]
    return {'registration_fees':result,'subscriptions':subscriptions}
