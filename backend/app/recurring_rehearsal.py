"""Create a fresh synthetic scenario using private, reusable test credential hashes.

Input is piped privately from the retained disposable dump, never command arguments.
Refuses operational databases and any existing account; no reset or overwrite.
"""
import json
import re
import sys
from datetime import datetime,date,timezone
from uuid import uuid4
from sqlalchemy.orm import Session
from app.database import engine
from app.documents_rehearsal import guard
from app.security.auth import PERMISSIONS,TEMPLATES,now
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.subscription import Subscription
from app.models.business_settings import SubscriptionSettingsSnapshot
from app.models.audit_event import AuditEvent
from app.services.business_settings import active
from app.services.fee_currency import create_obligation
from app.services.recurring_subscriptions import following


def main():
    guard()
    data=json.load(sys.stdin)
    if data['admin']['email']==data['member']['email']:raise RuntimeError('Distinct synthetic accounts required')
    for name in ['admin','member']:
        row=data[name]
        if set(row)!={'email','password_hash'} or not re.fullmatch(r'[^@\s]+@example\.test',row['email']) or not re.fullmatch(r'\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}',row['password_hash']):
            raise RuntimeError('Private synthetic credentials required')
    with Session(engine) as db:
        if db.query(User).count():raise RuntimeError('Fresh disposable scenario required; no accounts reset')
        catalog={p.code:p for p in db.query(Permission)}
        for code in sorted(PERMISSIONS-catalog.keys()):
            p=Permission(code=code);db.add(p);db.flush();catalog[code]=p
        roles={}
        for role,codes in TEMPLATES.items():
            r=Role(name=role);db.add(r);db.flush();roles[role]=r
            for code in codes:db.add(RolePermission(role_id=r.id,permission_id=catalog[code].id))
        admin=User(**data['admin'],role_id=roles['administrator'].id,is_active=True)
        user=User(**data['member'],role_id=roles['member'].id,is_active=True)
        db.add_all([admin,user]);db.flush()
        member=Member(member_number='TEST-RECURRING-MANUAL',first_name='Synthetic',last_name='Recurring rehearsal',user_id=user.id);db.add(member);db.flush()
        current=now().date();index=current.year*12+current.month-1-2
        activated=datetime(index//12,index%12+1,15,tzinfo=timezone.utc)
        first=following(activated.strftime('%Y-%m'))
        app=MembershipApplication(application_number='TEST-RECURRING-'+uuid4().hex,member_id=member.id,first_name='Synthetic',last_name='Recurring rehearsal',email=user.email,status='Activated');db.add(app);db.flush()
        db.add(MembershipApproval(application_id=app.id,member_id=member.id,user_id=user.id,approved_by=admin.id,approver_email=admin.email,approved_at=activated,activated_at=activated,subscription_start_month=first,acknowledgement_version='synthetic-fixture',acknowledgement_text='TEST ONLY synthetic activation scenario; not a normal registration approval'))
        version,terms=active(db)
        sub=Subscription(subscription_reference='TEST-EXISTING-FIRST',member_id=member.id,period_month=first,amount=terms['subscription_amount'],currency=terms['subscription_currency'],status='Pending',due_date=date.fromisoformat(first+f"-{terms['subscription_due_day']:02d}") if terms['subscription_due_day'] else None)
        db.add(sub);db.flush()
        if version:db.add(SubscriptionSettingsSnapshot(subscription_id=sub.id,version_id=version))
        create_obligation(db,admin,sub.amount,sub.currency,subscription_id=sub.id,at=activated)
        db.add(AuditEvent(event_type='test_fixture',actor_user_id=admin.id,actor_email=admin.email,action='synthetic_recurring_rehearsal_created',target_table='members',target_id=str(member.id),details='TEST ONLY fresh scenario reuses private disposable credentials; existing first unpaid obligation; no payments, no ledger, no normal policy approval. Original saved rehearsal untouched.'))
        db.commit()
    print('PASS: fresh disposable recurring scenario ready; two reusable test logins, one existing unpaid obligation, no payments or savings posting')


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Rehearsal preparation refused; transaction rolled back. No private inputs printed.')
