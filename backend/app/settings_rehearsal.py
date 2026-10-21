"""Private CLI setup and read-only historical checks for the disposable rehearsal only."""
import argparse,hashlib,json,os,sys
from pathlib import Path
from sqlalchemy.orm import Session
from app.database import engine
from app.config import get_settings
from app.migrations import require_current_schema
from app.bootstrap import bootstrap
from app.security.console import private_input
from app.models.user import User
from app.models.role import Role
from app.models.application import MembershipApplication
from app.models.membership import ApplicationRegistrationPayment,MembershipApproval
from app.models.subscription import Subscription
from app.models.fee_currency import FeeObligation,FeeRatePublication
from app.schemas.membership import PaymentRecord
from app.services import membership

FILE=Path('/tmp/settings-rehearsal-history.json')


def guard():
    if engine.url.database!='isave_test_settings_rehearsal' or os.environ.get('ISAVE_REHEARSAL_ONLY')!='1' or get_settings().app_env!='development':
        raise RuntimeError('Disposable rehearsal required')
    require_current_schema(engine)


def fingerprints(db,application_id,subscription_id):
    models=[(ApplicationRegistrationPayment,application_id),(Subscription,subscription_id)]
    result={}
    for model,identifier in models:
        row=db.get(model,identifier)
        values={c.name:getattr(row,c.name) for c in model.__table__.columns}
        result[model.__tablename__]=hashlib.sha256(json.dumps(values,sort_keys=True,default=str).encode()).hexdigest()
    for name,selector in [('registration',{'application_id':application_id}),('subscription',{'subscription_id':subscription_id})]:
        row=db.query(FeeObligation).filter_by(**selector).one()
        values={c.name:getattr(row,c.name) for c in row.__table__.columns}
        result[name+'_obligation']=hashlib.sha256(json.dumps(values,sort_keys=True,default=str).encode()).hexdigest()
    return result


def setup():
    with Session(engine) as db:
        # tmpfs PostgreSQL may be empty after a host/container restart while
        # the backend's old fingerprint file still survives. Retain that
        # evidence, but never mistake it for a current database fixture.
        if FILE.exists() and not db.query(User).count():
            from uuid import uuid4
            if db.query(MembershipApplication).count() or db.query(FeeObligation).count():
                raise RuntimeError('Unowned rehearsal records require review')
            retained = FILE.with_name(FILE.name + '.previous-' + uuid4().hex)
            FILE.rename(retained)
            print('Previous-run fingerprints retained. Empty disposable database requires fresh private setup; historical records were not restored.')
        if not db.query(User).count():
            email=private_input('Disposable Admin email (hidden; do not use your normal account): ')
            password=private_input('Unique disposable Admin password (12–72 characters; hidden): ')
            if password!=private_input('Confirm disposable password (hidden): '):raise RuntimeError('Passwords differ')
            bootstrap(db,email,password)
            del password,email
        actor=db.query(User).join(Role).filter(Role.name=='administrator',User.is_active.is_(True)).one()
        if FILE.exists():
            print('Rehearsal is already initialised. Credentials were not changed.');return
        old=db.query(MembershipApplication).filter_by(application_number='REHEARSAL-HISTORY').one_or_none()
        if not old:
            old=MembershipApplication(application_number='REHEARSAL-HISTORY',first_name='Historical',last_name='Synthetic',email='settings-history@example.test',status='Pending')
            db.add(old);db.commit()
        if db.query(FeeRatePublication).count():raise RuntimeError('Use an unpublished, fresh rehearsal environment')
        membership.record_payment(db,actor,old.id,PaymentRecord(amount='20.00',currency='USD',payment_date='2026-01-01',reference='SETTINGS-REHEARSAL-HISTORY'));db.commit()
        membership.verify_payment(db,actor,old.id);db.commit()
        membership.approve(db,actor,old.id);db.commit()
        membership.activate(db,actor,old.id);db.commit()
        approval=db.get(MembershipApproval,old.id)
        sub=db.query(Subscription).filter_by(member_id=approval.member_id).one()
        if not db.query(MembershipApplication).filter_by(application_number='REHEARSAL-REVIEW').first():
            db.add(MembershipApplication(application_number='REHEARSAL-REVIEW',first_name='Future',last_name='Synthetic',email='settings-review@example.test',status='Pending'));db.commit()
        FILE.write_text(json.dumps({'application_id':old.id,'subscription_id':sub.id,'fingerprints':fingerprints(db,old.id,sub.id)}))
        FILE.chmod(0o600)
        print('PASS: disposable Admin ready; synthetic USD20 paid registration and USD5 pending subscription preserved as history. Rate 34 remains unpublished. No credentials printed.')


def verify():
    saved=json.loads(FILE.read_text())
    with Session(engine) as db:
        if fingerprints(db,saved['application_id'],saved['subscription_id'])!=saved['fingerprints']:raise RuntimeError('Historical fixture differs')
    print('PASS: original synthetic payment, subscription and frozen obligations are unchanged.')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--verify-history',action='store_true');a=p.parse_args()
    try:
        guard()
        if a.verify_history:verify()
        else:
            if not sys.stdin.isatty():raise RuntimeError('Private interactive terminal required')
            setup()
    except Exception:
        p.exit(1,'Rehearsal command refused or incomplete. Check the disposable project/schema, private input and original fixture status. No credentials or error objects printed.\n')


if __name__=='__main__':main()
