import json
"""Read-only member-owned portal records; fees never become savings."""
from sqlalchemy import select
from decimal import Decimal
from app.models.membership import ApplicationRegistrationPayment as Payment, MembershipApproval as Approval
from app.models.registration_fee import RegistrationFee
from app.models.subscription import Subscription
from app.services.membership import verified
from app.models.application import MembershipApplication, SavingsInterest
from app.models.member import Member
from app.models.business_settings import SubscriptionSettingsSnapshot
from app.models.fee_currency import FeeObligation,SubscriptionFeePayment
from app.services.fee_currency import quote


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
    from app.models.evidence_enrolment import PlanApplication, PlanEnrolment
    from app.security.auth import permissions
    enrolments=[]
    if member and 'plans:own' in permissions(db,actor):
        enrolments=[{'application_id':r.id,'category':json.loads(r.terms_snapshot)['terms']['category'],'currency':r.currency,'weekly_target':str(r.weekly_target),
            'start_date':e.start_date,'end_date':e.end_date} for r,e in db.query(PlanApplication,PlanEnrolment).join(PlanEnrolment,PlanEnrolment.application_id==PlanApplication.id).filter(PlanApplication.member_id==member.id).all()]
    return {
        'member': None if not member else {'first_name':member.first_name,
            'last_name':member.last_name,'member_number':member.member_number},
        'membership': {'status':status,
            'approved_at':approval.approved_at if approval else None,
            'activated_at':approval.activated_at if approval else None,
            'subscription_start_month':approval.subscription_start_month if approval else None},
        'fees':fees,
        'registration_fee_verified': any(r['verified_at'] and r['status']=='Paid' for r in fees['registration_fees']),
        'savings_interests':interests,
        'plan_enrolment':{'available':bool(enrolments),'items':enrolments,'notice':'An expression of interest is not an approved savings-plan enrolment. Plan applications require effective published terms, authorised review and separate activation.'},
        # The legacy helper mixes currencies and does not establish reconciled,
        # immutable ledger totals. Expose no balance, even if rows say Verified.
        'savings':savings_summary(db, member.id) if member and 'savings:own' in permissions(db,actor) else {'available':False,'message':'Savings summary not available yet'},
        'subscription_due_day':next((s['due_date'].day for s in reversed(fees['subscriptions']) if s['due_date']),None),
    }


def fee_records(db, member):
    if not member:
        return {'registration_fees': [], 'subscriptions': []}
    result=[]
    for payment,approval in db.execute(select(Payment,Approval).join(Approval,Approval.application_id==Payment.application_id).where(Payment.member_id==member.id,Approval.member_id==member.id,Approval.activated_at.is_not(None))):
        if verified(payment,db):
            obligation=db.query(FeeObligation).filter_by(application_id=payment.application_id).one_or_none()
            result.append({'amount':str(obligation.amount if obligation else payment.amount),'currency':obligation.currency if obligation else payment.currency,'status':'Paid','reference':payment.reference,'payment_date':payment.payment_date,'verified_at':payment.verified_at,
                'payment_amount':str(payment.amount),'payment_currency':payment.currency,'obligation':quote(db,obligation)})
    # Preserve separately recorded historical fees without copying them into the new payment table.
    for old in db.query(RegistrationFee).filter_by(member_id=member.id).all():
        result.append({'amount':str(old.amount),'currency':old.currency,'status':old.status,'reference':old.fee_reference,'payment_date':old.paid_at.date() if old.paid_at else None,'verified_at':None})
    subscriptions=[]
    for s in db.query(Subscription).filter_by(member_id=member.id).order_by(Subscription.period_month).all():
        payment=db.get(SubscriptionFeePayment,s.id)
        subscriptions.append({'amount':str(s.amount),'currency':s.currency,'period_month':s.period_month,'status':s.status if s.status in {'Pending','Paid'} else 'Requires office review','due_date':s.due_date if db.get(SubscriptionSettingsSnapshot,s.id) else None,
            'obligation':quote(db,db.query(FeeObligation).filter_by(subscription_id=s.id).one_or_none()),
            'payment_status':'Paid' if payment and payment.verified_at else 'Pending verification' if payment else 'Unpaid' if s.status=='Pending' else 'Legacy status requires review',
            'payment':None if not payment else {'amount':str(payment.amount),'currency':payment.currency,'reference':payment.reference,'payment_date':payment.payment_date,'verified_at':payment.verified_at}})
    return {'registration_fees':result,'subscriptions':subscriptions}

from app.services.savings import summary as savings_summary
