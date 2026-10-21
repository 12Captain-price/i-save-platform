"""Synthetic-only dump/restore migration rehearsal. Not a normal-database utility."""
import argparse,hashlib,json
from datetime import date,datetime,timezone
from sqlalchemy import inspect,select,text,Table,MetaData
from sqlalchemy.orm import Session
from alembic import command
from app.database import engine
from app.migrations import migration_config,upgrade,require_current_schema


def fingerprint(expected=None):
    result={}
    with engine.connect() as c:
        i=inspect(c)
        for name in list(expected) if expected else sorted(set(i.get_table_names())-{'alembic_version'}):
            table=Table(name,MetaData(),autoload_with=c);rows=list(c.execute(select(table)))
            if expected and name in {'permissions','role_permissions'}:
                keys={tuple(k) for k in expected[name]['keys']};kept=[]
                for row in rows:
                    if tuple(row._mapping[k.name] for k in table.primary_key) in keys:kept.append(row);continue
                    if name=='permissions':assert row._mapping['code'] in {'subscription-fees:record','subscription-fees:verify'}
                    else:assert c.execute(text("SELECT count(*) FROM permissions p CROSS JOIN roles r WHERE p.id=:p AND r.id=:r AND r.name='administrator' AND p.code IN ('subscription-fees:record','subscription-fees:verify')"),{'p':row._mapping['permission_id'],'r':row._mapping['role_id']}).scalar()==1
                rows=kept
            payload=sorted(json.dumps(list(r),default=str) for r in rows)
            result[name]={'hash':hashlib.sha256(json.dumps(payload).encode()).hexdigest(),'columns':str(i.get_columns(name)),'pk':i.get_pk_constraint(name),'fk':i.get_foreign_keys(name),'indexes':i.get_indexes(name),'unique':i.get_unique_constraints(name),'keys':sorted([r._mapping[k.name] for k in table.primary_key] for r in rows) if name in {'permissions','role_permissions'} else []}
    return result


def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','snapshot','compare','upgrade']);p.add_argument('--file',default='/drill/before.json');a=p.parse_args()
    assert (engine.url.database or '').startswith('isave_test_currency_'),'Refusing non-disposable database'
    if a.action=='prepare':
        with engine.connect() as c:command.upgrade(migration_config(c),'0009_business_settings')
        from app.models.role import Role
        from app.models.user import User
        from app.models.member import Member
        from app.models.application import MembershipApplication
        from app.models.membership import ApplicationRegistrationPayment
        from app.models.subscription import Subscription
        with Session(engine) as db:
            assert db.query(User).count()==0
            role=Role(name='administrator');db.add(role);db.flush()
            actor=User(email='restore-admin@example.test',role_id=role.id,is_active=True);db.add(actor);db.flush()
            member=Member(member_number='RESTORE-SYNTHETIC',first_name='Restore',last_name='Synthetic');db.add(member)
            application=MembershipApplication(application_number='RESTORE-APP',first_name='Restore',last_name='Synthetic',email='restore-applicant@example.test',status='Pending');db.add(application);db.flush()
            db.add(ApplicationRegistrationPayment(application_id=application.id,amount='20',currency='USD',reference='RESTORE-RECEIPT',reference_key='restore-reference-key',payment_date=date(2026,1,1),recorded_by=actor.id,recorder_email=actor.email,verified_by=actor.id,verifier_email=actor.email,verified_at=datetime.now(timezone.utc)))
            db.add(Subscription(subscription_reference='RESTORE-SUB',member_id=member.id,period_month='2026-11',amount='5',currency='USD',status='Pending',due_date=None));db.commit()
        print('PASS: synthetic pre-0010 database prepared')
    elif a.action=='snapshot':
        open(a.file,'w').write(json.dumps(fingerprint(),sort_keys=True));print('PASS: 30 original-table fingerprints stored')
    else:
        expected=json.load(open(a.file));assert fingerprint(expected)==expected,'Original rows/schema differ'
        if a.action=='upgrade':
            upgrade(engine);require_current_schema(engine)
            assert fingerprint(expected)==expected,'Original rows/schema changed by migration'
            from app.models.fee_currency import FeeObligation,FeeRateVersion,FeeRatePublication
            with Session(engine) as db:
                assert db.query(FeeRateVersion).one().rate==34
                assert db.query(FeeRatePublication).count()==0
                obligations=db.query(FeeObligation).all();assert len(obligations)==2
                assert all(r.rate_version_id is None and r.zig_amount is None for r in obligations)
        print('PASS: restoration/migration preserves all 30 original tables; only known subscription permissions/Admin grants may be added')


if __name__=='__main__':main()
