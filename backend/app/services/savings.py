"""Atomic office contributions, independent controls and immutable ledger totals."""
import hashlib
import json
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from sqlalchemy import select, func
from app.exceptions import APIError
from app.models.savings import SavingsContribution as Contribution, SavingsEvent as Event, SavingsLedgerEntry as Ledger
from app.models.evidence_enrolment import PlanApplication, PlanEnrolment
from app.models.membership import MembershipApproval
from app.models.member import Member
from app.models.contribution import Contribution as Legacy
from app.models.audit_event import AuditEvent
from app.security.auth import now, permissions
from app.services.membership import advisory, reference_lock
from app.services.business_settings import active

CODES = {'read', 'record', 'verify', 'reconcile', 'reverse', 'extra'}


def fail(message, code=409):
    raise APIError(code, 'savings_workflow', message)


def normal_reference(value):
    return ' '.join(value.split()).casefold()


def snapshot(body):
    return json.dumps(body.model_dump(mode='json'), sort_keys=True)


def audit(db, actor, row, action):
    db.add(AuditEvent(event_type='savings', actor_user_id=actor.id, actor_email=actor.email,
        action='savings_'+action, target_table='savings_contributions', target_id=str(row.id)))


def event(db, actor, row, action, body):
    e = Event(contribution_id=row.id, action=action, outcome=body.outcome, evidence_reference=body.evidence_reference,
        reason=body.reason, actor_id=actor.id, actor_email=actor.email, request_key=str(body.request_key), request_snapshot=snapshot(body))
    db.add(e); db.flush(); audit(db, actor, row, action)
    return e


def record(db, actor, body):
    advisory(db, 'savings-request:'+str(body.request_key))
    old = db.query(Contribution).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.request_snapshot != snapshot(body) or old.recorded_by != actor.id: fail('Request key was already used for another submission')
        return present(db, old)
    reference = normal_reference(body.reference)
    if not reference: fail('A payment reference is required', 400)
    reference_lock(db,body.reference)
    from app.services.fee_currency import check_reference
    check_reference(db,body.reference)
    enrolment=db.execute(select(PlanEnrolment).where(PlanEnrolment.application_id==body.enrolment_id).with_for_update()).scalar_one_or_none()
    plan=db.get(PlanApplication,body.enrolment_id)
    if not enrolment or not plan or plan.status!='Active':fail('An active member enrolment is required')
    membership=db.query(MembershipApproval).filter_by(member_id=plan.member_id).one_or_none()
    if not membership or not membership.activated_at:fail('Activated membership is required')
    if body.currency!=plan.currency:fail('Payment currency must match the accepted enrolment currency; no savings conversion',400)
    version,terms=active(db)
    separation=terms.get('savings_separation') or 'distinct_all'
    flags=[]
    today=now().astimezone(ZoneInfo('Africa/Harare')).date()
    if body.payment_date<enrolment.start_date or body.payment_date>=enrolment.end_date:flags.append('Outside programme dates: approved handling rules required')
    if body.payment_date>today:flags.append('Future payment date: cannot confirm receipt')
    week_start=terms.get('savings_week_start')
    monday=(enrolment.start_date+timedelta(days=((body.payment_date-enrolment.start_date).days//7)*7)) if week_start=='enrolment_start' else body.payment_date-timedelta(days=body.payment_date.weekday())
    existing=sum((r.amount for r in db.query(Contribution).filter(Contribution.enrolment_id==plan.id,
        Contribution.payment_date>=monday,Contribution.payment_date<monday+timedelta(days=7),
        Contribution.status.notin_(['Rejected','Reversed']))),Decimal('0'))
    if not week_start:flags.append('Extra contribution assessment requires explicit authorisation: weekly allocation convention is unset')
    elif existing+body.amount>plan.weekly_target:flags.append('Extra contribution requires explicit authorisation')
    row=Contribution(enrolment_id=plan.id,member_id=plan.member_id,amount=body.amount,currency=plan.currency,
        payment_date=body.payment_date,method=body.method,reference=body.reference,reference_key=hashlib.sha256(reference.encode()).hexdigest(),
        request_key=str(body.request_key),request_snapshot=snapshot(body),policy_snapshot=json.dumps({'version':version,'separation':separation,'explicitly_configured':bool(terms.get('savings_separation')),'weekly_allocation':week_start}),
        flags=json.dumps(flags),status='Pending verification',recorded_by=actor.id)
    db.add(row);db.flush();audit(db,actor,row,'recorded')
    return present(db,row)


def history(db,row):
    return db.query(Event).filter_by(contribution_id=row.id).order_by(Event.id).all()


def action(db,actor,identifier,kind,body):
    # All balance-reducing workflows lock the enrolled programme first.
    existing=db.get(Contribution,identifier)
    if existing:
        db.execute(select(PlanEnrolment).where(PlanEnrolment.application_id==existing.enrolment_id).with_for_update()).scalar_one()
    row=db.execute(select(Contribution).where(Contribution.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not row:fail('Contribution not found',404)
    advisory(db,'savings-event-key:'+str(body.request_key))
    old=db.query(Event).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.contribution_id!=row.id or old.actor_id!=actor.id or old.action!=kind or old.request_snapshot!=snapshot(body):fail('Request key reused for a different action')
        return present(db,row)
    events=history(db,row)
    if body.base_event_id!=(events[-1].id if events else 0):fail('Contribution changed; refresh before taking another action')
    flags=json.loads(row.flags)
    if kind=='extra':
        if body.outcome!='Authorised' or row.status!='Pending verification' or not any('Extra contribution' in f for f in flags):fail('Extra authorisation is not applicable')
        if any(e.action=='extra' for e in events):fail('Extra contribution was already authorised')
    elif kind=='verify':
        if row.status!='Pending verification' or body.outcome not in {'Verified','Rejected'}:fail('Only pending records can be verified or rejected')
        if json.loads(row.policy_snapshot)['separation']!='same_actor_allowed' and actor.id==row.recorded_by:fail('Savings policy requires a verifier separate from the recorder',403)
        if body.outcome=='Verified':
            if any('Outside' in f or 'Future' in f for f in flags):fail('Flagged programme dates require approved handling rules; confirmation unavailable')
            if any('Extra contribution' in f for f in flags) and not any(e.action=='extra' for e in events):fail('Separate extra-contribution authorisation required')
        row.status=body.outcome
    elif kind=='reconcile':
        if row.status not in {'Verified','Discrepancy'} or body.outcome not in {'Matched','Discrepancy'}:fail('Only verified or discrepant records can be reconciled')
        verifier=next(e.actor_id for e in events if e.action=='verify' and e.outcome=='Verified')
        separation=json.loads(row.policy_snapshot)['separation']
        if separation=='distinct_all' and actor.id in {row.recorded_by,verifier}:fail('Savings policy requires a reconciler separate from recorder and verifier',403)
        if separation=='recorder_separate' and actor.id==row.recorded_by:fail('Savings policy requires reconciliation separate from the recorder',403)
        if body.observed_amount is None or body.observed_currency is None or body.observed_reference is None:fail('Record observed amount, currency and payment reference',400)
        matched=(body.observed_amount==row.amount and body.observed_currency==row.currency and normal_reference(body.observed_reference)==normal_reference(row.reference))
        if body.outcome=='Matched' and not matched:fail('Observed payment does not match; record a discrepancy',400)
        row.status='Confirmed' if body.outcome=='Matched' else 'Discrepancy'
    elif kind=='reverse':
        if row.status!='Confirmed' or body.outcome!='Reversed':fail('Only a confirmed contribution can be reversed once')
        from app.services.withdrawals import funds
        if Decimal(funds(db,row.enrolment_id)['available'])<row.amount:fail('Reserved or paid withdrawal funds require reviewed correction; reversal cannot spend them')
        row.status='Reversed'
    else:fail('Unsupported action',404)
    e=event(db,actor,row,kind,body)
    if row.status=='Confirmed' and kind=='reconcile':
        db.add(Ledger(contribution_id=row.id,member_id=row.member_id,kind='Credit',amount=row.amount,currency=row.currency,event_id=e.id))
    if kind=='reverse':
        credit=db.query(Ledger).filter_by(contribution_id=row.id,kind='Credit').one()
        db.add(Ledger(contribution_id=row.id,member_id=row.member_id,kind='Reversal',amount=-credit.amount,currency=credit.currency,reverses_id=credit.id,event_id=e.id))
    db.flush();return present(db,row)


def present(db,row):
    events=history(db,row)
    entries=db.query(Ledger).filter_by(contribution_id=row.id).order_by(Ledger.id).all()
    credit=next((e for e in entries if e.kind=='Credit'),None)
    reversal=next((e for e in entries if e.kind=='Reversal'),None)
    receipt_available=bool(credit and ((row.status=='Confirmed' and not reversal) or
        (row.status=='Reversed' and reversal and reversal.reverses_id==credit.id)))
    return {'id':row.id,'enrolment_id':row.enrolment_id,'member_id':row.member_id,'amount':str(row.amount),'currency':row.currency,
        'payment_date':row.payment_date,'method':row.method,'reference':row.reference,'status':row.status,'flags':json.loads(row.flags),
        'policy':json.loads(row.policy_snapshot),'recorded_by':row.recorded_by,'recorded_at':row.recorded_at,
        'base_event_id':events[-1].id if events else 0,
        'history':[{'id':e.id,'action':e.action,'outcome':e.outcome,'evidence_reference':e.evidence_reference,'reason':e.reason,'actor':e.actor_email,'recorded_at':e.recorded_at} for e in events],
        'ledger':[{'id':e.id,'kind':e.kind,'amount':str(e.amount),'currency':e.currency,'reverses_id':e.reverses_id} for e in entries],
        'receipt_available':receipt_available}


def summary(db,member_id=None):
    from app.models.withdrawal import WithdrawalDebit,WithdrawalRequest
    from app.services.withdrawals import RESERVED
    totals=db.query(Ledger.currency,func.sum(Ledger.amount))
    pending=db.query(Contribution.currency,func.sum(Contribution.amount)).filter(Contribution.status.in_(['Pending verification','Verified','Discrepancy']))
    legacy=db.query(Legacy)
    if member_id is not None:
        totals=totals.filter(Ledger.member_id==member_id);pending=pending.filter(Contribution.member_id==member_id);legacy=legacy.filter(Legacy.member_id==member_id)
    values={c:Decimal(a) for c,a in totals.group_by(Ledger.currency)}
    debits=db.query(WithdrawalDebit.currency,func.sum(WithdrawalDebit.amount))
    reserves=db.query(WithdrawalRequest.currency,func.sum(WithdrawalRequest.amount)).filter(WithdrawalRequest.status.in_(RESERVED))
    if member_id is not None:debits=debits.filter(WithdrawalDebit.member_id==member_id);reserves=reserves.filter(WithdrawalRequest.member_id==member_id)
    for c,a in debits.group_by(WithdrawalDebit.currency):values[c]=values.get(c,Decimal('0'))+a
    reserved={c:Decimal(a) for c,a in reserves.group_by(WithdrawalRequest.currency)}
    return {'available':True,'confirmed':[{'currency':c,'amount':format(a,'.2f')} for c,a in sorted(values.items())],
        'reserved':[{'currency':c,'amount':format(a,'.2f')} for c,a in sorted(reserved.items())],
        'available_funds':[{'currency':c,'amount':format(a-reserved.get(c,Decimal('0')),'.2f')} for c,a in sorted(values.items())],
        'pending':[{'currency':c,'amount':str(a)} for c,a in pending.group_by(Contribution.currency)],
        'legacy_requires_review':legacy.count(),'message':'Confirmed savings uses verified and reconciled ledger credits minus linked reversals and verified withdrawal debits. Fees and subscriptions are excluded. Currencies are never converted.'}
