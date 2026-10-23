"""Disposable-only scenario runner. Normal uvicorn never imports this module.

The scenario clock is installed only by this guarded entrypoint, never by an
environment switch in the operational withdrawal service or a browser endpoint.
Authentication continues to use real time. No existing account is reset.
"""
import json
import sys
import re
from pathlib import Path
from datetime import datetime,date,timedelta,timezone
from uuid import uuid4
from decimal import Decimal
from sqlalchemy.orm import Session
from app.database import engine
from app.documents_rehearsal import guard
from app.security.auth import now as real_now,PERMISSIONS,TEMPLATES
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.plan_draft import PlanDraft,PlanDraftVersion
from app.models.evidence_enrolment import PlanApproval,PlanPublication,PlanApplication,PlanEnrolment
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.audit_event import AuditEvent
from app.schemas.enrolment import ACK_TEXT,ACK_VERSION,WITHDRAWAL_TEXT,MISSED_TEXT
from app.schemas.plan_draft import DraftTerms
from app.schemas.savings import Record,Decision
from app.services import savings,withdrawals
from app.services.business_settings import active
from app.services.enrolment import end_date
from app.savings_rehearsal import TERMS

CLOCK=Path('/tmp/withdrawal-test-clock.json')
POLICY={'withdrawal_mode':'full_or_partial','withdrawal_limits':'no_limits','withdrawal_methods':'cash_only',
 'withdrawal_approval_levels':1,'withdrawal_separation':'same_actor_allowed','withdrawal_cancellation':'before_processing_only',
 'withdrawal_failure':'evidence_review_before_release'}


def clock():
    value=datetime.fromisoformat(json.loads(CLOCK.read_text())['now'])
    if value.tzinfo is None:raise RuntimeError('Aware synthetic clock required')
    return value


def prepare():
    guard()
    data=json.load(sys.stdin)
    for key in ['admin','member']:
        row=data[key]
        if set(row)!={'email','password_hash'} or not re.fullmatch(r'[^@\s]+@example\.test',row['email']) or not re.fullmatch(r'\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}',row['password_hash']):
            raise RuntimeError('Private synthetic credentials required')
    if data['admin']['email']==data['member']['email']:raise RuntimeError('Distinct accounts required')
    timestamp=real_now()-timedelta(days=14)
    with Session(engine) as db:
        if db.query(User).count():raise RuntimeError('Fresh disposable fixture required; no reset')
        catalog={p.code:p for p in db.query(Permission)}
        for code in sorted(PERMISSIONS-catalog.keys()):
            p=Permission(code=code);db.add(p);db.flush();catalog[code]=p
        roles={}
        for name,codes in TEMPLATES.items():
            role=Role(name=name);db.add(role);db.flush();roles[name]=role
            for code in codes:db.add(RolePermission(role_id=role.id,permission_id=catalog[code].id))
        admin=User(**data['admin'],role_id=roles['administrator'].id,is_active=True)
        user=User(**data['member'],role_id=roles['member'].id,is_active=True)
        db.add_all([admin,user]);db.flush()
        member=Member(member_number='TEST-WITHDRAWAL-MEMBER',first_name='Synthetic',last_name='Withdrawal rehearsal',user_id=user.id);db.add(member);db.flush()
        app=MembershipApplication(application_number='TEST-WITHDRAWAL-'+uuid4().hex,member_id=member.id,first_name='Synthetic',last_name='Withdrawal rehearsal',email=user.email,status='Activated');db.add(app);db.flush()
        db.add(MembershipApproval(application_id=app.id,member_id=member.id,user_id=user.id,approved_by=admin.id,approver_email=admin.email,approved_at=timestamp,activated_at=timestamp,acknowledgement_version='test-only',acknowledgement_text='TEST ONLY synthetic scenario; no normal approval'))
        version,terms=active(db)
        setting=BusinessSettingsVersion(base_version=version,request_key=str(uuid4()),snapshot=json.dumps({**terms,**POLICY,'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'}),actor_id=admin.id,actor_email=admin.email)
        db.add(setting);db.flush();db.add(BusinessSettingsPublication(version_id=setting.id,effective_at=real_now(),request_key=str(uuid4()),request_snapshot='TEST ONLY same-actor policy in disposable rehearsal; not approved normal policy',actor_id=admin.id,actor_email=admin.email));db.flush()
        # Mature USD, premature USD and separate unfunded ZiG; no new accounts.
        for label,currency,start in [('Mature','USD',date(2025,1,31)),('Premature','USD',timestamp.date()-timedelta(days=1)),('Separate currency','ZWG',date(2025,1,31))]:
            draft=PlanDraft(latest_version=1);db.add(draft);db.flush()
            terms=DraftTerms(**{**TERMS,'currency':currency,'description':'TEST ONLY '+label+' withdrawal scenario'}).model_dump(mode='json')
            version=PlanDraftVersion(draft_id=draft.id,version=1,request_key=str(uuid4()),snapshot=json.dumps(terms),actor_id=admin.id,actor_email=admin.email);db.add(version);db.flush()
            db.add(PlanApproval(version_id=version.id,actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4())));db.flush()
            db.add(PlanPublication(version_id=version.id,effective_at=real_now(),actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4()),request_snapshot='TEST ONLY'))
            accepted={'draft_id':draft.id,'version_id':version.id,'version':1,'terms':terms,'acknowledgement':ACK_TEXT,'acknowledgement_version':ACK_VERSION,'withdrawal_access':WITHDRAWAL_TEXT,'missed_target_policy':MISSED_TEXT,'notice':'TEST ONLY synthetic accepted terms'}
            plan=PlanApplication(member_id=member.id,draft_id=draft.id,version_id=version.id,terms_snapshot=json.dumps(accepted,sort_keys=True),weekly_target=Decimal('100'),currency=currency,acknowledgement_text=ACK_TEXT,acknowledged_at=timestamp,actor_id=user.id,status='Active',request_key=str(uuid4()));db.add(plan);db.flush()
            db.add(PlanEnrolment(application_id=plan.id,activated_at=datetime.combine(start,datetime.min.time(),timezone.utc),start_date=start,end_date=end_date(start),actor_id=admin.id,actor_email=admin.email));db.flush()
            if label=='Mature':
                row=savings.record(db,admin,Record(request_key=uuid4(),enrolment_id=plan.id,amount='10',currency=currency,payment_date=end_date(start)-timedelta(days=1),method='TEST ONLY cash',reference='TEST-WITHDRAWAL-FUNDING'))
                row=savings.action(db,admin,row['id'],'verify',Decision(request_key=uuid4(),base_event_id=0,outcome='Verified',evidence_reference='TEST-FUNDING-VERIFY',reason='TEST ONLY synthetic funding'))
                savings.action(db,admin,row['id'],'reconcile',Decision(request_key=uuid4(),base_event_id=row['base_event_id'],outcome='Matched',evidence_reference='TEST-FUNDING-MATCH',reason='TEST ONLY synthetic funding',observed_amount='10',observed_currency='USD',observed_reference='TEST-WITHDRAWAL-FUNDING'))
        db.add(AuditEvent(event_type='test_fixture',actor_user_id=admin.id,actor_email=admin.email,action='test_only_withdrawal_fixture',target_table='members',target_id=str(member.id),details='TEST ONLY synthetic mature/premature enrolments, USD10 reconciled funding, explicit disposable policy and isolated scenario clock. No normal policy approval.'))
        db.commit()
    CLOCK.write_text(json.dumps({'now':timestamp.isoformat()}))
    print('PASS: two reusable synthetic accounts, mature/premature programmes and USD10 test funding prepared; normal database untouched')


def serve():
    guard()
    # Only this explicitly selected disposable server installs the scenario clock.
    withdrawals.now=clock
    import uvicorn
    from app.main import app
    uvicorn.run(app,host='0.0.0.0',port=8000,proxy_headers=False,access_log=False)


def advance():
    guard()
    from app.models.withdrawal import WithdrawalRequest
    with Session(engine) as db:
        row=db.query(WithdrawalRequest).one()
        if row.status!='Approved':raise RuntimeError('Approve the one synthetic request before advancing')
        # Minute-precision UI entry must still be strictly beyond the original
        # deadline. Only the disposable scenario clock moves; rows stay frozen.
        timestamp=max(real_now(),row.notice_ends_at).replace(second=0,microsecond=0)+timedelta(minutes=2)
    CLOCK.write_text(json.dumps({'now':timestamp.isoformat()}))
    print('PASS: disposable scenario clock advanced past notice; stored request/history unchanged')


if __name__=='__main__':
    try:
        {'prepare':prepare,'serve':serve,'advance':advance}[sys.argv[1]]()
    except Exception as error:
        import traceback
        frames=traceback.extract_tb(error.__traceback__)
        location=' > '.join(Path(f.filename).name+':'+str(f.lineno) for f in frames)
        raise SystemExit('Disposable operation refused ('+type(error).__name__+' at '+location+'); no private inputs printed')
