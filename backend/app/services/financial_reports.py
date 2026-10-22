"""One UNION snapshot of authoritative records; totals never combine currencies."""
import csv
import io
from collections import defaultdict
from datetime import date
from decimal import Decimal
from sqlalchemy import select, literal, cast, String, union_all, case, func
from app.exceptions import APIError
from app.models.membership import ApplicationRegistrationPayment as Registration
from app.models.registration_fee import RegistrationFee as LegacyFee
from app.models.subscription import Subscription
from app.models.fee_currency import SubscriptionFeePayment as Payment
from app.models.savings import SavingsContribution as Contribution, SavingsLedgerEntry as Ledger

LIMIT=10000


def records(db,start:date,end:date,currency=None,category=None):
    if end<start or (end-start).days>366:
        raise APIError(400,'date_range','Select an inclusive date range of at most 367 days')
    def row(kind,identifier,amount,ccy,when,status,reference,linked=literal('')):
        return select(literal(kind).label('category'),cast(identifier,String).label('source_id'),amount.label('amount'),
            ccy.label('currency'),cast(when,String).label('date'),status.label('status'),reference.label('reference'),cast(linked,String).label('linked_id'))
    sources=[
        row('registration_payments',Registration.application_id,Registration.amount,Registration.currency,Registration.payment_date,
            case((Registration.verified_at.is_not(None),'Verified'),else_='Pending verification'),Registration.reference),
        row('legacy_registration',LegacyFee.id,LegacyFee.amount,LegacyFee.currency,LegacyFee.paid_at,LegacyFee.status,LegacyFee.fee_reference),
        row('subscription_obligations',Subscription.id,Subscription.amount,Subscription.currency,Subscription.period_month+literal('-01'),Subscription.status,Subscription.subscription_reference),
        row('subscription_payments',Payment.subscription_id,Payment.amount,Payment.currency,Payment.payment_date,
            case((Payment.verified_at.is_not(None),'Verified'),else_='Pending verification'),Payment.reference),
        row('savings_ledger',Ledger.id,Ledger.amount,Ledger.currency,Ledger.recorded_at,Ledger.kind,cast(Ledger.contribution_id,String),Ledger.reverses_id),
        row('savings_pending',Contribution.id,Contribution.amount,Contribution.currency,Contribution.payment_date,Contribution.status,Contribution.reference).where(
            Contribution.status.in_(['Pending verification','Verified','Discrepancy']))]
    combined=union_all(*sources).subquery()
    # Payment dates are date-only. Ledger instants are interpreted in Harare.
    ledger_date=func.to_char(func.timezone('Africa/Harare',cast(combined.c.date,__import__('sqlalchemy').DateTime(timezone=True))),'YYYY-MM-DD') if db.bind.dialect.name=='postgresql' else func.substr(combined.c.date,1,10)
    day=case((combined.c.category=='savings_ledger',ledger_date),else_=func.substr(combined.c.date,1,10))
    query=select(combined).where(day>=str(start),day<=str(end))
    if currency:query=query.where(combined.c.currency==currency)
    if category:query=query.where(combined.c.category==category)
    rows=db.execute(query.order_by(combined.c.category,combined.c.source_id).limit(LIMIT+1)).mappings().all()
    if len(rows)>LIMIT:raise APIError(409,'report_limit','More than 10000 source rows; narrow the date range or currency/category filter')
    result=[{**r,'amount':str(r['amount'])} for r in rows]
    totals=defaultdict(lambda:Decimal('0'))
    for r in rows:
        totals[(r['category'],r['currency'],r['status'])]+=r['amount']
    net=defaultdict(lambda:Decimal('0'))
    for r in rows:
        if r['category']=='savings_ledger':net[r['currency']]+=r['amount']
    return {'items':result,'total':len(result),'totals':[{'category':k[0],'currency':k[1],'status':k[2],'amount':str(v)} for k,v in sorted(totals.items())],
        'net_ledger_movement':[{'currency':k,'amount':str(v)} for k,v in sorted(net.items())],
        'definition':'Inclusive dates: subscription obligations use obligation month (first day), fee payments and pending savings use payment date; ledger credits/reversals use posting date in Africa/Harare. Net is movement during this window, not an all-time balance. Only Verified fee payments count as verified receipts; pending records are not verified money. Legacy fees retain reported status without inferred verification. No currencies are combined.'}


def csv_export(result):
    if result['total']>5000:raise APIError(409,'export_limit','CSV is limited to 5000 rows; narrow the filters')
    out=io.StringIO(newline='')
    writer=csv.writer(out)
    fields=['category','source_id','date','amount','currency','status','reference','linked_id']
    writer.writerow(fields)
    for row in result['items']:
        values=[]
        for field in fields:
            value=str(row[field] if row[field] is not None else '')
            # Monetary amounts are trusted Decimal strings; user-controlled cells
            # may start formulas even after leading whitespace/control characters.
            if field!='amount' and value.lstrip().startswith(('=','+','-','@')):value="'"+value
            if field!='amount' and any(c in value for c in '\r\n\t'):value="'"+value
            values.append(value)
        writer.writerow(values)
    return out.getvalue()
