"""Synthetic two-account rehearsal; refuses operational databases before connecting."""
import json
import sys
from uuid import uuid4
from datetime import timedelta
from sqlalchemy.orm import Session
from pydantic import ValidationError
from app.database import engine
from app.documents_rehearsal import guard
from app.security.console import private_input
from app.security.hashing import hash_password
from app.security.auth import now
from app.schemas.user import UserCreate
from app.schemas.plan_draft import DraftTerms
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.plan_draft import PlanDraft,PlanDraftVersion
from app.models.evidence_enrolment import PlanApproval,PlanPublication,PlanApplication,PlanEnrolment
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.models.audit_event import AuditEvent
from app.schemas.enrolment import ACK_TEXT,ACK_VERSION,WITHDRAWAL_TEXT,MISSED_TEXT
from app.services.business_settings import active
from app.services.enrolment import end_date

TERMS={'category':'education','description':'TEST ONLY - synthetic savings rehearsal; not approved normal policy.',
    'currency':'USD','contribution_mode':'member_chosen','cadence':'weekly','duration_mode':'calendar_months','duration_months':8,
    'missed_contributions':'No automatic consequences for missed weekly targets.',
    'extra_contributions':'Voluntary extras require explicit office authorisation, verification and reconciliation.',
    'missed_target_policy':'no_automatic_consequences','extra_contribution_policy':'voluntary_no_automatic_posting',
    'withdrawal_access':'after_completion_14_days_notice_review_unavailable','benefits_policy':'unavailable'}


class SetupRefused(RuntimeError):
    """Only fixed, non-sensitive diagnostics may be printed."""


def validate_credentials(role,email,password):
    if not email.endswith('@example.test'):
        raise SetupRefused(role+' email must use the synthetic @example.test domain.')
    try:
        UserCreate(email=email,password=password)
    except ValidationError as error:
        fields={item['loc'][0] for item in error.errors(include_input=False)}
        if 'email' in fields:
            raise SetupRefused(role+' email format is invalid.') from None
        raise SetupRefused(role+' password must contain 12-72 characters and at most 72 UTF-8 bytes.') from None


def seed(db,admin_email,admin_password,member_email,member_password):
    guard()
    if admin_email==member_email:raise SetupRefused('Admin and Member must use different synthetic email addresses.')
    for role,email,password in [('Admin',admin_email,admin_password),('Member',member_email,member_password)]:
        validate_credentials(role,email,password)
        if db.query(User).filter_by(email=email).first():raise SetupRefused(role+' account already exists; no reset performed.')
    from app.bootstrap import bootstrap
    if not db.query(User).count():bootstrap(db,admin_email,admin_password)
    admin=db.query(User).filter_by(email=admin_email).first()
    if not admin:
        admin=User(email=admin_email,password_hash=hash_password(admin_password),role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True);db.add(admin);db.flush()
    user=User(email=member_email,password_hash=hash_password(member_password),role_id=db.query(Role).filter_by(name='member').one().id,is_active=True);db.add(user);db.flush()
    member=Member(member_number='SYNTHETIC-SAVINGS-'+uuid4().hex[:8],first_name='Synthetic',last_name='Savings member',user_id=user.id);db.add(member);db.flush()
    app=MembershipApplication(application_number='SYNTHETIC-SAVINGS-'+uuid4().hex,member_id=member.id,first_name='Synthetic',last_name='Savings member',email=member_email,status='Activated');db.add(app);db.flush()
    db.add(MembershipApproval(application_id=app.id,member_id=member.id,user_id=user.id,approved_by=admin.id,approver_email=admin.email,approved_at=now(),acknowledgement_version='synthetic-fixture',acknowledgement_text='TEST ONLY fixture, not a normal approval',activated_at=now()))
    _,settings=active(db);head=db.query(BusinessSettingsVersion).order_by(BusinessSettingsVersion.id.desc()).first()
    setting=BusinessSettingsVersion(base_version=head.id if head else 0,request_key=str(uuid4()),snapshot=json.dumps({**settings,'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'}),actor_id=admin.id,actor_email=admin.email)
    db.add(setting);db.flush();db.add(BusinessSettingsPublication(version_id=setting.id,request_key=str(uuid4()),request_snapshot='TEST ONLY synthetic separation relaxation for two-account rehearsal; not normal policy',effective_at=now(),actor_id=admin.id,actor_email=admin.email))
    for currency in ['USD','ZWG']:
        draft=PlanDraft(latest_version=1);db.add(draft);db.flush()
        terms=DraftTerms(**{**TERMS,'currency':currency}).model_dump(mode='json')
        v=PlanDraftVersion(draft_id=draft.id,version=1,request_key=str(uuid4()),snapshot=json.dumps(terms),actor_id=admin.id,actor_email=admin.email);db.add(v);db.flush()
        db.add(PlanApproval(version_id=v.id,actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4())));db.flush()
        db.add(PlanPublication(version_id=v.id,effective_at=now(),actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4()),request_snapshot='TEST ONLY synthetic terms'))
        accepted={'draft_id':draft.id,'version_id':v.id,'version':1,'terms':terms,'acknowledgement':ACK_TEXT,'acknowledgement_version':ACK_VERSION,'withdrawal_access':WITHDRAWAL_TEXT,'missed_target_policy':MISSED_TEXT,'notice':'TEST ONLY synthetic fixture; no funds posted.'}
        plan=PlanApplication(member_id=member.id,draft_id=draft.id,version_id=v.id,terms_snapshot=json.dumps(accepted,sort_keys=True),weekly_target='100.00',currency=currency,acknowledgement_text=ACK_TEXT,acknowledged_at=now(),actor_id=user.id,status='Active',request_key=str(uuid4()));db.add(plan);db.flush()
        start=now().date()-timedelta(days=1)
        db.add(PlanEnrolment(application_id=plan.id,activated_at=now(),start_date=start,end_date=end_date(start),actor_id=admin.id,actor_email=admin.email))
    db.add(AuditEvent(event_type='test_fixture',actor_user_id=admin.id,actor_email=admin.email,action='synthetic_savings_rehearsal_created',target_table='members',target_id=str(member.id),details='TEST ONLY: explicit same-actor test policy; no normal policy approval or financial posting.'))
    db.commit()


def main():
    try:guard()
    except Exception:raise SetupRefused('Disposable target or current schema check failed.') from None
    if not sys.stdin.isatty():raise SetupRefused('Private interactive terminal required.')
    print('Disposable savings rehearsal only. This creates exactly one Admin and one Member with synthetic enrolments.')
    if private_input('Type TEST ONLY to explicitly allow same-actor savings processing in this disposable rehearsal: ')!='TEST ONLY':raise SetupRefused('TEST ONLY acknowledgement did not match exactly; nothing changed.')
    values=[]
    for role in ['Admin','Member']:
        email=private_input(role+' synthetic @example.test email (hidden): ').strip().lower()
        password=private_input(role+' unique password (12-72 characters, at most 72 UTF-8 bytes; hidden): ')
        if password!=private_input('Confirm password (hidden): '):raise SetupRefused(role+' password confirmation did not match; nothing changed.')
        validate_credentials(role,email,password)
        values.extend([email,password])
    # Bootstrap commits its session; an outer transaction keeps setup atomic.
    with engine.begin() as connection:
        with Session(bind=connection,join_transaction_mode='create_savepoint') as db:
            seed(db,*values)
    print('PASS: two disposable accounts and labelled synthetic enrolments prepared. No payment, ledger credit or normal configuration changed. Use port 13030 only.')


if __name__=='__main__':
    try:main()
    except SetupRefused as error:sys.exit('Refused: '+str(error))
    except Exception:sys.exit('Refused: database fixture creation failed; transaction rolled back. No credentials printed.')
