"""Read-only member-owned portal records; fees never become savings."""
from sqlalchemy import select
from decimal import Decimal
from app.models.membership import ApplicationRegistrationPayment as Payment, MembershipApproval as Approval
from app.models.registration_fee import RegistrationFee
from app.models.subscription import Subscription
from app.services.membership import verified
from app.models.application import MembershipApplication, SavingsInterest
from app.models.member import Member


def overview(db, actor):
    # No browser IDs or email-based matching: the persisted account link is the
    # ownership boundary, including for historical interest snapshots.
    member = db.query(Member).filter_by(user_id=actor.id).one_or_none()
    fees = fee_records(db, member)
    approval = None
    interests = []
    if member:
        approval = db.execute(select(Approval).join(MembershipApplication,
            MembershipApplication.id == Approval.application_id).where(
            Approval.member_id == member.id, Approval.user_id == actor.id,
            MembershipApplication.member_id == member.id)).scalar_one_or_none()
        rows = db.query(SavingsInterest).join(MembershipApplication,
            MembershipApplication.id == SavingsInterest.application_id).filter(
            MembershipApplication.member_id == member.id).order_by(
            SavingsInterest.recorded_at.desc(), SavingsInterest.id.desc()).all()
        interests = [{'category':r.category,'category_label':r.category_label,
            'purpose':r.purpose,'notice_version':r.notice_version,
            'notice_text':r.notice_text,'recorded_at':r.recorded_at} for r in rows]
    status = 'No member record linked' if not member else (
        'Activated' if approval and approval.activated_at else
        'Approved — awaiting activation' if approval else 'Not confirmed')
    return {
        'member': None if not member else {'first_name':member.first_name,
            'last_name':member.last_name,'member_number':member.member_number},
        'membership': {'status':status,
            'approved_at':approval.approved_at if approval else None,
            'activated_at':approval.activated_at if approval else None,
            'subscription_start_month':approval.subscription_start_month if approval else None},
        'fees':fees,
        'registration_fee_verified': any(r['verified_at'] and r['status']=='Paid'
            and r['currency']=='USD' and Decimal(r['amount'])==Decimal('20.00') for r in fees['registration_fees']),
        'savings_interests':interests,
        'plan_enrolment':{'available':False,'notice':'Formal savings-plan approval is not configured. An expression of interest is not an approved savings-plan enrolment.'},
        # The legacy helper mixes currencies and does not establish reconciled,
        # immutable ledger totals. Expose no balance, even if rows say Verified.
        'savings':{'available':False,'message':'Savings summary not available yet'},
        'subscription_due_day':None,
    }


def fee_records(db, member):
    if not member:
        return {'registration_fees': [], 'subscriptions': []}
    result=[]
    for payment,approval in db.execute(select(Payment,Approval).join(Approval,Approval.application_id==Payment.application_id).where(Payment.member_id==member.id,Approval.member_id==member.id,Approval.activated_at.is_not(None))):
        if verified(payment):result.append({'amount':str(payment.amount),'currency':payment.currency,'status':'Paid','reference':payment.reference,'payment_date':payment.payment_date,'verified_at':payment.verified_at})
    # Preserve separately recorded historical fees without copying them into the new payment table.
    for old in db.query(RegistrationFee).filter_by(member_id=member.id).all():
        result.append({'amount':str(old.amount),'currency':old.currency,'status':old.status,'reference':old.fee_reference,'payment_date':old.paid_at.date() if old.paid_at else None,'verified_at':None})
    subscriptions=[{'amount':str(s.amount),'currency':s.currency,'period_month':s.period_month,'status':s.status if s.status in {'Pending','Paid'} else 'Requires office review','due_date':None} for s in db.query(Subscription).filter_by(member_id=member.id).order_by(Subscription.period_month).all()]
    return {'registration_fees':result,'subscriptions':subscriptions}
