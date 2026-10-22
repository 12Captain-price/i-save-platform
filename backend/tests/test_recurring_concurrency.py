from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from decimal import Decimal
from sqlalchemy.orm import Session
import pytest
from app.migrations import upgrade
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.subscription import Subscription
from app.models.fee_currency import FeeObligation
from app.models.audit_event import AuditEvent
from app.services.recurring_subscriptions import generate
from app.services.fee_currency import subscription_payment,verify_subscription
from app.models.fee_currency import SubscriptionFeePayment
from app.schemas.membership import PaymentRecord
from app.security.auth import now
from tests.test_migration_lifecycle import migration_database


def test_concurrent_catchup_creates_each_month_and_audit_once(migration_database):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('Real scheduler concurrency requires PostgreSQL')
    upgrade(engine)
    with Session(engine) as db:
        admin=bootstrap(db,'scheduler-admin@example.test','Synthetic-secret-only-123')
        user=User(email='scheduler-member@example.test',role_id=db.query(Role).filter_by(name='member').one().id,is_active=True);db.add(user);db.flush()
        m=Member(member_number='TEST-RECURRING',first_name='Synthetic',last_name='Scheduler',user_id=user.id);db.add(m);db.flush()
        app=MembershipApplication(application_number='TEST-RECURRING',member_id=m.id,first_name='Synthetic',last_name='Scheduler',email=user.email,status='Activated');db.add(app);db.flush()
        at=datetime(2025,12,31,20,0,tzinfo=timezone.utc)
        db.add(MembershipApproval(application_id=app.id,member_id=m.id,user_id=user.id,approved_by=admin.id,approver_email=admin.email,approved_at=at,activated_at=at,subscription_start_month='2026-01',acknowledgement_version='TEST',acknowledgement_text='TEST ONLY'))
        # Activation already created the first obligation: never replace/reprice it.
        first=Subscription(subscription_reference='TEST-FIRST',member_id=m.id,period_month='2026-01',amount=Decimal('3'),currency='USD',status='Pending');db.add(first);db.commit()
        first_id=first.id
    def work(_):
        with Session(engine) as db:
            result=generate(db,through='2026-03');db.commit();return result['created']
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sorted(pool.map(work,range(4)))==[0,0,0,2]
    with Session(engine) as db:
        assert db.query(Subscription).count()==3
        assert db.get(Subscription,first_id).amount==Decimal('3')
        assert db.query(FeeObligation).count()==2
        assert db.query(AuditEvent).filter_by(action='monthly_subscription_created').count()==2
        sub=db.query(Subscription).filter_by(period_month='2026-02').one()
        sub_id=sub.id
        recorder_id=db.query(User).filter_by(email='scheduler-admin@example.test').one().id
        verifier=User(email='scheduler-verifier@example.test',role_id=db.query(Role).filter_by(name='finance').one().id,is_active=True)
        db.add(verifier);db.commit();verifier_id=verifier.id
    def pay(_):
        with Session(engine) as db:
            subscription_payment(db,db.get(User,recorder_id),sub_id,PaymentRecord(amount='5',currency='USD',payment_date=now().date(),reference='TEST-CONCURRENT-SUBSCRIPTION'))
            db.commit()
    def verify(_):
        with Session(engine) as db:
            verify_subscription(db,db.get(User,verifier_id),sub_id);db.commit()
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(pay,range(4)))
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(verify,range(4)))
    with Session(engine) as db:
        assert db.query(SubscriptionFeePayment).count()==1
        assert db.get(Subscription,sub_id).status=='Paid'
        assert db.query(AuditEvent).filter_by(action='subscription_payment_recorded').count()==1
        assert db.query(AuditEvent).filter_by(action='subscription_payment_verified').count()==1
