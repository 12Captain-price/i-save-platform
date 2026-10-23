"""Reservations serialize on the enrolled programme; only verified payout debits savings."""
import json
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from sqlalchemy import select,func
from app.exceptions import APIError
from app.models.withdrawal import WithdrawalRequest as Request,WithdrawalEvent as Event,WithdrawalPayout as Payout,WithdrawalDebit as Debit
from app.models.evidence_enrolment import PlanApplication,PlanEnrolment
from app.models.savings import SavingsContribution as Contribution,SavingsLedgerEntry as Ledger
from app.models.member import Member
from app.models.audit_event import AuditEvent
from app.security.auth import now,aware
from app.services.business_settings import active
from app.services.membership import advisory,reference_lock
from app.services.enrolment import end_date

RESERVED={'Requested','Approved','Processing','Recorded','Uncertain'}


def fail(message,status=409):raise APIError(status,'withdrawal_conflict',message)


def snapshot(body):return json.dumps(body.model_dump(mode='json'),sort_keys=True)


def policy_blockers(policy,currency=None):
    required=['mode','limits','methods','approval_levels','separation','cancellation','failure']
    missing=['Withdrawal decision missing: '+k.replace('_',' ') for k in required if not policy.get('withdrawal_'+k)]
    if policy.get('withdrawal_limits')=='bounded':
        for c in ([currency.lower()] if currency else ['usd','zwg']):
            lo=policy.get('withdrawal_'+c+'_min');hi=policy.get('withdrawal_'+c+'_max')
            if hi is None:missing.append('Withdrawal maximum missing: '+c.upper())
            if lo is not None and hi is not None and Decimal(lo)>Decimal(hi):missing.append('Withdrawal minimum exceeds maximum: '+c.upper())
    return missing


def lock_enrolment(db,identifier):
    row=db.execute(select(PlanEnrolment).where(PlanEnrolment.application_id==identifier).with_for_update()).scalar_one_or_none()
    if not row:fail('Enrolment not found',404)
    return row


def funds(db,identifier):
    credit=db.query(func.coalesce(func.sum(Ledger.amount),0)).join(Contribution,Contribution.id==Ledger.contribution_id).filter(Contribution.enrolment_id==identifier).scalar()
    debit=db.query(func.coalesce(func.sum(Debit.amount),0)).filter_by(enrolment_id=identifier).scalar()
    reserved=db.query(func.coalesce(func.sum(Request.amount),0)).filter(Request.enrolment_id==identifier,Request.status.in_(RESERVED)).scalar()
    confirmed=Decimal(credit)+Decimal(debit)
    return {'confirmed':format(confirmed,'.2f'),'reserved':format(Decimal(reserved),'.2f'),'available':format(confirmed-Decimal(reserved),'.2f')}


def eligibility(db,plan,enrolment):
    version,terms=active(db)
    policy={k:v for k,v in terms.items() if k.startswith('withdrawal_')}
    blockers=policy_blockers(policy,plan.currency)
    accepted=json.loads(plan.terms_snapshot).get('terms',{})
    if (accepted.get('duration_months')!=8 or accepted.get('currency')!=plan.currency or
        accepted.get('withdrawal_access')!='after_completion_14_days_notice_review_unavailable' or
        enrolment.end_date!=end_date(enrolment.start_date)):
        blockers.append('Recorded dates or accepted terms need explicit review; no terms or dates are rewritten')
    timestamp=now()
    eligible=timestamp.astimezone(ZoneInfo('Africa/Harare')).date()>=enrolment.end_date
    if not eligible:blockers.append('Programme completion is required before requesting withdrawal')
    balance=funds(db,plan.id)
    if Decimal(balance['available'])<=0:blockers.append('No unreserved confirmed savings are available for this enrolment')
    return {'enrolment_id':plan.id,'currency':plan.currency,'completion_date':enrolment.end_date,
        'eligible_by_date':eligible,'can_request':not blockers,'blockers':blockers,
        'earliest_possible_payout_at':timestamp+timedelta(days=14) if eligible else None,
        'notice':'A minimum two-week notice starts only when an eligible request is submitted. Eligibility and approval do not confirm a payout.',
        'settings_version':version,'policy':policy,**balance}


def audit(db,actor,row,action):
    db.add(AuditEvent(event_type='withdrawal',actor_user_id=actor.id,actor_email=actor.email,action='withdrawal_'+action,target_table='withdrawal_requests',target_id=str(row.id)))


def event(db,actor,row,action,body):
    e=Event(withdrawal_id=row.id,action=action,outcome=row.status,reason=body.reason,evidence_reference=body.evidence_reference,
        actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snapshot(body))
    db.add(e);db.flush();audit(db,actor,row,action)
    from app.services.account_workflows import member_notice
    member_notice(db,row.member_id,'withdrawal-event:'+str(e.id),'Withdrawal status: '+row.status+'. Approval and processing do not confirm payout; only Paid indicates verified payout.','withdrawals')
    return e


def request(db,actor,body):
    advisory(db,'withdrawal-request:'+str(body.request_key))
    old=db.query(Request).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.actor_id!=actor.id or old.request_snapshot!=snapshot(body):fail('Request key already used')
        return present(db,old)
    member=db.query(Member).filter_by(user_id=actor.id).one_or_none()
    plan=db.get(PlanApplication,body.enrolment_id)
    if not member or not plan or plan.member_id!=member.id:fail('Enrolment not found',404)
    enrol=lock_enrolment(db,plan.id)
    state=eligibility(db,plan,enrol)
    if state['blockers']:fail('; '.join(state['blockers']))
    if body.currency!=plan.currency:fail('Use enrolment currency; savings conversion is unavailable',400)
    policy={**state['policy'],'request_acknowledgement_version':'withdrawal-request-v1','request_acknowledgement':"I request this amount under the displayed eligibility and published withdrawal policy. I understand that reservation and approval are not payout and that two weeks' notice begins on submission."};available=Decimal(state['available'])
    if body.amount>available:fail('Insufficient available reconciled savings')
    if policy['withdrawal_mode']=='full_only' and (body.amount!=available or Decimal(state['reserved'])>0):fail('This policy permits only the full unreserved balance')
    if policy['withdrawal_limits']=='bounded':
        prefix='withdrawal_'+plan.currency.lower()
        if body.amount<Decimal(policy.get(prefix+'_min') or 0) or body.amount>Decimal(policy[prefix+'_max']):fail('Amount is outside the approved currency-specific limits',400)
    timestamp=now()
    row=Request(enrolment_id=plan.id,member_id=member.id,amount=body.amount,currency=plan.currency,status='Requested',
        terms_snapshot=plan.terms_snapshot,policy_snapshot=json.dumps(policy,sort_keys=True),settings_version=state['settings_version'] or None,
        completion_date=enrol.end_date,requested_at=timestamp,notice_ends_at=timestamp+timedelta(days=14),actor_id=actor.id,
        request_key=str(body.request_key),request_snapshot=snapshot(body))
    db.add(row);db.flush()
    db.add(Event(withdrawal_id=row.id,action='request',outcome='Requested',reason='Member explicitly acknowledged withdrawal request',evidence_reference='Authenticated member submission',actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snapshot(body)))
    audit(db,actor,row,'requested');db.flush();return present(db,row)


def action(db,actor,identifier,kind,body):
    existing=db.get(Request,identifier)
    if not existing:fail('Withdrawal not found',404)
    # Contribution recording takes receipt lock before enrolment; match that
    # order to avoid a reference/enrolment deadlock across the two workflows.
    if kind=='record' and body.payment_reference:reference_lock(db,body.payment_reference)
    lock_enrolment(db,existing.enrolment_id)
    row=db.execute(select(Request).where(Request.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one()
    advisory(db,'withdrawal-event:'+str(body.request_key))
    old=db.query(Event).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.withdrawal_id!=row.id or old.actor_id!=actor.id or old.action!=kind or old.request_snapshot!=snapshot(body):fail('Action key reused')
        return present(db,row)
    history=db.query(Event).filter_by(withdrawal_id=row.id).order_by(Event.id).all()
    if body.base_event_id!=(history[-1].id if history else 0):fail('Withdrawal changed; refresh before acting')
    policy=json.loads(row.policy_snapshot)
    if policy_blockers(policy,row.currency):fail('Snapshotted policy is incomplete; explicit review required')
    approvals=[e for e in history if e.action=='approve']
    payout=db.get(Payout,row.id)
    timestamp=now()
    if kind=='approve':
        if row.status!='Requested':fail('Only requested withdrawals may be approved')
        if any(e.actor_id==actor.id for e in approvals):fail('Each approval level requires a different authorised reviewer')
        row.status='Approved' if len(approvals)+1>=policy['withdrawal_approval_levels'] else 'Requested'
    elif kind in {'reject','cancel'}:
        if row.status not in {'Requested','Approved'} or payout:fail('Only unprocessed requests can release their reservation by cancellation/rejection')
        row.status='Rejected' if kind=='reject' else 'Cancelled'
    elif kind=='process':
        if row.status!='Approved':fail('Approval is required before processing')
        if timestamp<aware(row.notice_ends_at):fail('The minimum two-week notice has not ended')
        if policy['withdrawal_separation']=='distinct_all' and actor.id in {e.actor_id for e in approvals}:fail('A separate payout processor is required',403)
        row.status='Processing'
    elif kind=='record':
        if row.status!='Processing' or payout:fail('Start approved payout processing before recording evidence')
        if timestamp<aware(row.notice_ends_at):fail('Notice period has not ended')
        processor=next(e.actor_id for e in history if e.action=='process')
        if actor.id!=processor:fail('The authenticated processing employee must record this payout',403)
        methods={'cash_only':{'manual_cash'},'bank_only':{'manual_bank_record'},'cash_and_bank':{'manual_cash','manual_bank_record'}}[policy['withdrawal_methods']]
        if body.method not in methods or not body.payment_date or not body.payment_at or not body.payment_reference:fail('Provide an approved manual method, actual payout date/time and unique reference',400)
        local=timestamp.astimezone(ZoneInfo('Africa/Harare')).date()
        if not aware(row.notice_ends_at).astimezone(ZoneInfo('Africa/Harare')).date()<=body.payment_date<=local:fail('Payment date must be after notice and not in the future',400)
        if not aware(row.notice_ends_at)<=body.payment_at<=timestamp or body.payment_at.astimezone(ZoneInfo('Africa/Harare')).date()!=body.payment_date:fail('Actual payout time must be after notice, not future, and match its Harare payment date',400)
        reference_lock(db,body.payment_reference)
        from app.services.fee_currency import check_reference
        check_reference(db,body.payment_reference)
        from app.services.savings import normal_reference
        from app.security.auth import digest
        db.add(Payout(withdrawal_id=row.id,amount=row.amount,currency=row.currency,method=body.method,payment_date=body.payment_date,payment_at=body.payment_at,
            reference=body.payment_reference,reference_key=digest(normal_reference(body.payment_reference)),recorded_by=actor.id))
        row.status='Recorded'
    elif kind=='uncertain':
        if row.status not in {'Processing','Recorded'}:fail('Only an in-progress payout may be marked uncertain')
        row.status='Uncertain'
    elif kind=='not_paid':
        if row.status not in {'Processing','Recorded','Uncertain'}:fail('Only unresolved unpaid processing can be closed by evidence review')
        processor=next(e.actor_id for e in history if e.action=='process')
        if policy['withdrawal_separation']!='same_actor_allowed' and actor.id==processor:fail('Independent evidence review is required before releasing uncertain funds',403)
        row.status='Failed'
    elif kind=='verify':
        if row.status not in {'Recorded','Uncertain'} or not payout:fail('Recorded actual payout evidence is required')
        if timestamp<aware(row.notice_ends_at):fail('Notice period has not ended')
        separation=policy['withdrawal_separation']
        if separation!='same_actor_allowed' and actor.id==payout.recorded_by:fail('A separate payout verifier is required',403)
        if separation=='distinct_all' and actor.id in {e.actor_id for e in approvals}:fail('Verifier must also be separate from approvers',403)
        if Decimal(funds(db,row.enrolment_id)['confirmed'])<row.amount:fail('Confirmed funds require reconciliation; reservation remains in place')
        payout.verified_by=actor.id;payout.verified_at=timestamp;row.status='Paid'
    else:fail('Unsupported action',404)
    e=event(db,actor,row,kind,body)
    if kind=='verify':
        db.add(Debit(withdrawal_id=row.id,enrolment_id=row.enrolment_id,member_id=row.member_id,amount=-row.amount,currency=row.currency,event_id=e.id))
    db.flush();return present(db,row)


def present(db,row):
    events=db.query(Event).filter_by(withdrawal_id=row.id).order_by(Event.id).all()
    payout=db.get(Payout,row.id);debit=db.query(Debit).filter_by(withdrawal_id=row.id).one_or_none()
    return {'id':row.id,'enrolment_id':row.enrolment_id,'member_id':row.member_id,'amount':str(row.amount),'currency':row.currency,
        'status':row.status,'reserved':row.status in RESERVED,'completion_date':row.completion_date,'requested_at':row.requested_at,'notice_ends_at':row.notice_ends_at,
        'settings_version':row.settings_version,'policy':json.loads(row.policy_snapshot),'accepted_terms':json.loads(row.terms_snapshot),
        'base_event_id':events[-1].id if events else 0,'history':[{'id':e.id,'action':e.action,'status':e.outcome,'reason':e.reason,'evidence_reference':e.evidence_reference,'actor':e.actor_email,'at':e.recorded_at} for e in events],
        'payout':None if not payout else {'amount':str(payout.amount),'currency':payout.currency,'method':payout.method,'payment_date':payout.payment_date,'payment_at':payout.payment_at,'reference':payout.reference,'recorded_by':payout.recorded_by,'verified_by':payout.verified_by,'verified_at':payout.verified_at},
        'debit':None if not debit else {'id':debit.id,'amount':str(debit.amount),'currency':debit.currency,'withdrawal_id':debit.withdrawal_id},
        'receipt_available':bool(row.status=='Paid' and payout and payout.verified_at and debit and debit.amount==-row.amount and payout.amount==row.amount and debit.member_id==row.member_id and debit.enrolment_id==row.enrolment_id and debit.currency==payout.currency==row.currency),
        'notice':'Manual payout evidence is recorded and reviewed; no external provider transfer is initiated. Approval/reservation is not payment. Paid history cannot be cancelled or restored by a status change.'}
