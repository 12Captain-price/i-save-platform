"""Only full-fee settlement. Frozen quotes, Decimal multiplication, one final rounding."""
from decimal import Decimal, ROUND_HALF_UP,localcontext
from sqlalchemy import select,update,func
from app.exceptions import APIError, not_found
from app.models.fee_currency import FeeRateVersion, FeeRatePublication, FeeObligation, SubscriptionFeePayment
from app.models.subscription import Subscription
from app.models.membership import ApplicationRegistrationPayment
from app.models.registration_fee import RegistrationFee
from app.models.audit_event import AuditEvent
from app.security.auth import now,digest
import json

ROUNDING='ROUND_HALF_UP_2DP'


def active_rate(db,at=None):
    return db.execute(select(FeeRateVersion).join(FeeRatePublication,FeeRatePublication.version_id==FeeRateVersion.id).where(
        FeeRatePublication.effective_at<=(at or now())).order_by(FeeRatePublication.effective_at.desc(),FeeRatePublication.id.desc())).scalars().first()


def converted(amount,rate):
    with localcontext() as context:
        context.prec=50
        result=(Decimal(amount)*Decimal(rate)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
    if result<=0 or result>Decimal('9999999999.99'):
        raise APIError(400,'conversion_range','Converted amount is outside the supported payment range')
    return result


def create_obligation(db,actor,amount,currency,application_id=None,subscription_id=None,at=None,legacy=False):
    existing=db.query(FeeObligation).filter_by(application_id=application_id).one_or_none() if application_id else db.query(FeeObligation).filter_by(subscription_id=subscription_id).one_or_none()
    if existing:return existing
    rate=active_rate(db,at) if currency=='USD' and not legacy else None
    row=FeeObligation(application_id=application_id,subscription_id=subscription_id,amount=amount,currency=currency,
        rate_version_id=rate.id if rate else None,rate_per_usd=rate.rate if rate else None,
        zig_amount=converted(amount,rate.rate) if rate else None,rounding=ROUNDING,
        origin='Preserved legacy obligation' if legacy else 'Fee obligation created',created_by=None if legacy else actor.id,created_at=at or now())
    db.add(row);db.flush()
    if not legacy:audit(db,actor,'fee_obligation_created',row.id,{'application_id':application_id,'subscription_id':subscription_id,'amount':str(amount),'currency':currency,'rate_version':row.rate_version_id})
    return row


def quote(db,row):
    if not row:return None
    options=[{'amount':str(row.amount),'currency':row.currency}]
    rate=None
    if row.rate_version_id:
        version=db.get(FeeRateVersion,row.rate_version_id)
        publication=db.query(FeeRatePublication).filter_by(version_id=version.id).one()
        rate={'version':version.id,'per_usd':str(row.rate_per_usd),'source':version.source,'effective_at':publication.effective_at}
        options.append({'amount':str(row.zig_amount),'currency':'ZWG'})
    return {'id':row.id,'amount':str(row.amount),'currency':row.currency,'payment_options':options,'rate':rate,'rounding':row.rounding,'created_at':row.created_at,
        'conversion_unavailable':None if rate else 'No effective published USD-to-ZiG rate was captured when this obligation was created. Conversion is unavailable.' if row.currency=='USD' else 'Only USD-denominated fees support ZiG settlement.'}


def matches(row,amount,currency):
    return (currency==row.currency and amount==row.amount) or (row.currency=='USD' and currency=='ZWG' and row.rate_version_id is not None and amount==row.zig_amount)


def validate_payment(row,amount,currency):
    if currency=='ZWG' and row.currency=='USD' and row.rate_version_id is None:
        raise APIError(409,'rate_unavailable','No effective rate was captured for this obligation; ZiG payment is unavailable')
    if not matches(row,amount,currency):raise APIError(400,'fee_mismatch','Use the exact amount and currency shown on the frozen fee obligation. Partial or mixed payments are unavailable.')


def audit(db,actor,action,identifier,details):
    db.add(AuditEvent(event_type='fee_currency',actor_user_id=actor.id,actor_email=actor.email,action=action,target_table='fee_obligations',target_id=str(identifier),details=json.dumps(details)))


def normalized_reference(reference):
    return ' '.join(reference.split()).casefold()


def check_reference(db,reference):
    key=digest(reference.lower())
    from app.models.savings import SavingsContribution
    from app.models.contribution import Contribution
    normalized=normalized_reference(reference)
    for column in [SavingsContribution.reference,Contribution.contribution_reference,ApplicationRegistrationPayment.reference,SubscriptionFeePayment.reference,RegistrationFee.fee_reference]:
        if any(normalized_reference(value)==normalized for (value,) in db.query(column)):
            raise APIError(409,'duplicate_reference','Receipt/reference is already recorded')
    if db.query(ApplicationRegistrationPayment).filter_by(reference_key=key).first() or db.query(SubscriptionFeePayment).filter_by(reference_key=key).first() or db.query(RegistrationFee).filter(func.lower(RegistrationFee.fee_reference)==reference.lower()).first():
        raise APIError(409,'duplicate_reference','Receipt/reference is already recorded')
    return key


def lock_subscription(db,identifier):
    if db.bind.dialect.name=='sqlite':db.execute(update(Subscription).where(Subscription.id==identifier).values(id=Subscription.id,updated_at=Subscription.updated_at))
    row=db.execute(select(Subscription).where(Subscription.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not row:raise not_found('Subscription not found')
    return row


def subscription_payment(db,actor,identifier,body):
    from app.services.membership import reference_lock
    from zoneinfo import ZoneInfo
    sub=lock_subscription(db,identifier);reference_lock(db,body.reference)
    old=db.get(SubscriptionFeePayment,sub.id)
    if old:
        if (old.amount,old.currency,old.payment_date,old.reference.lower())==(body.amount,body.currency,body.payment_date,body.reference.lower()):return
        raise APIError(409,'conflict','A payment already exists. Corrections/refunds are unavailable.')
    if sub.status!='Pending':raise APIError(409,'conflict','Only an unpaid pending obligation can receive payment')
    obligation=db.query(FeeObligation).filter_by(subscription_id=sub.id).one_or_none()
    if not obligation:obligation=create_obligation(db,actor,sub.amount,sub.currency,subscription_id=sub.id,at=sub.created_at,legacy=True)
    validate_payment(obligation,body.amount,body.currency)
    if body.payment_date>now().astimezone(ZoneInfo('Africa/Harare')).date():raise APIError(400,'bad_request','Payment date cannot be in the future')
    key=check_reference(db,body.reference)
    db.add(SubscriptionFeePayment(subscription_id=sub.id,amount=body.amount,currency=body.currency,reference=body.reference,reference_key=key,payment_date=body.payment_date,recorded_by=actor.id,recorder_email=actor.email))
    audit(db,actor,'subscription_payment_recorded',obligation.id,{'amount':str(body.amount),'currency':body.currency,'reference':body.reference,'payment_date':str(body.payment_date),'rate_version':obligation.rate_version_id})


def verify_subscription(db,actor,identifier):
    sub=lock_subscription(db,identifier);payment=db.get(SubscriptionFeePayment,sub.id)
    if not payment:raise APIError(409,'missing_payment','Record the actual payment first')
    if payment.verified_at:return
    if sub.status!='Pending':raise APIError(409,'conflict','Subscription needs reconciliation')
    obligation=db.query(FeeObligation).filter_by(subscription_id=sub.id).one()
    validate_payment(obligation,payment.amount,payment.currency)
    payment.verified_at=now();payment.verified_by=actor.id;payment.verifier_email=actor.email
    sub.status='Paid';sub.paid_at=payment.verified_at
    audit(db,actor,'subscription_payment_verified',obligation.id,{'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':str(payment.payment_date),'rate_version':obligation.rate_version_id})
