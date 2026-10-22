"""Catch up activated memberships through the current Harare calendar month.

New records consume settings/rates at creation, never reprice existing records.
The scheduler has no invented staff identity; its audit actor is null.
"""
import json
import re
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo
from sqlalchemy import text
from app.exceptions import APIError
from app.models.membership import MembershipApproval
from app.models.subscription import Subscription
from app.models.business_settings import SubscriptionSettingsSnapshot
from app.models.audit_event import AuditEvent
from app.security.auth import now, aware
from app.services.business_settings import active
from app.services.fee_currency import create_obligation, active_rate

MAX_ITEMS = 5000


def following(period):
    year, month = map(int, period.split('-'))
    return f'{year+1:04d}-01' if month == 12 else f'{year:04d}-{month+1:02d}'


def plan(db, through=None, at=None):
    at = at or now()
    current = at.astimezone(ZoneInfo('Africa/Harare')).strftime('%Y-%m')
    through = through or current
    if not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', through) or through > current or through < '1900-01':
        raise APIError(400, 'period', 'Choose a month from 1900 through the current Harare month; advance billing is unavailable')
    version, terms = active(db, at)
    if terms['subscription_start'] != 'next_calendar_month' or not terms['subscription_amount'] or not terms['subscription_currency']:
        raise APIError(409, 'policy_missing', 'Publish complete subscription settings before generation')
    existing = set(db.query(Subscription.member_id, Subscription.period_month).all())
    items, review = [], []
    for approval in db.query(MembershipApproval).filter(MembershipApproval.activated_at.is_not(None)).order_by(MembershipApproval.member_id):
        expected = following(aware(approval.activated_at).astimezone(ZoneInfo('Africa/Harare')).strftime('%Y-%m'))
        if approval.subscription_start_month != expected:
            review.append(approval.member_id)
            continue
        period = expected
        while period <= through:
            if (approval.member_id, period) not in existing:
                if len(items) >= MAX_ITEMS:
                    raise APIError(409, 'batch_limit', 'More than 5000 missing obligations; run an earlier through-month first')
                items.append({'member_id': approval.member_id, 'period_month': period,
                    'amount': terms['subscription_amount'], 'currency': terms['subscription_currency'],
                    'due_date': date.fromisoformat(period+f"-{terms['subscription_due_day']:02d}") if terms['subscription_due_day'] else None})
            period = following(period)
    rate = active_rate(db, at)
    return {'through': through, 'created': 0, 'count': len(items), 'items': items,
        'settings_version': version, 'rate_version': rate.id if rate else None,
        'requires_review_member_ids': review,
        'explanation': 'Preview only. New obligations freeze settings and rates effective at creation. Existing obligations are never rewritten. Activation without a consistent start month requires review. No stop, overdue or penalty rule is inferred.'}


def generate(db, actor=None, through=None):
    if db.bind.dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(7341592613)'))
    # Read time after obtaining the generation lock, including catch-up/retries.
    timestamp = now()
    result = plan(db, through, timestamp)
    actor = actor or SimpleNamespace(id=None, email=None)
    for item in result['items']:
        row = Subscription(subscription_reference=f"SUB-{item['member_id']}-{item['period_month']}",
            member_id=item['member_id'], period_month=item['period_month'], amount=Decimal(item['amount']),
            currency=item['currency'], due_date=item['due_date'], status='Pending')
        db.add(row)
        db.flush()
        if result['settings_version']:
            db.add(SubscriptionSettingsSnapshot(subscription_id=row.id, version_id=result['settings_version']))
        create_obligation(db, actor, row.amount, row.currency, subscription_id=row.id, at=timestamp)
        db.add(AuditEvent(event_type='subscription_generation', actor_user_id=actor.id, actor_email=actor.email,
            action='monthly_subscription_created', target_table='subscriptions', target_id=str(row.id),
            details=json.dumps({'period':row.period_month, 'settings_version':result['settings_version'],
                'source':'authenticated_admin' if actor.id else 'scheduled_command'})))
    result['created'] = len(result['items'])
    result['explanation'] = 'Run completed atomically. Existing obligations and payments unchanged.'
    return result
