from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from datetime import datetime,timedelta,date,timezone
from uuid import uuid4
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import DBAPIError
from app.models.user import User
from app.models.role import Role
from app.models.evidence_enrolment import PlanApplication,PlanEnrolment
from app.models.withdrawal import WithdrawalRequest,WithdrawalDebit,WithdrawalPayout,WithdrawalEvent
from app.models.savings import SavingsLedgerEntry
from app.schemas.savings import Record,Decision
from app.schemas.withdrawal import RequestWithdrawal,WithdrawalDecision
from app.services import savings,withdrawals
from app.exceptions import APIError
from app.security.auth import now
from app.services.enrolment import end_date
from tests.test_migration_lifecycle import migration_database
from tests.test_enrolment_concurrency import test_concurrent_application_and_activation_are_single_events as seed
from tests.test_withdrawals import policy


def test_concurrent_reservations_and_verified_payout_are_single_debit(migration_database):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('True reservation and payout row-lock concurrency requires PostgreSQL')
    seed(engine)
    with Session(engine) as db:
        admin=db.query(User).join(Role).filter(Role.name=='administrator').one();member=db.query(User).join(Role).filter(Role.name=='member').one()
        actor_id,member_id=admin.id,member.id
        plan=db.query(PlanApplication).one();enrol=db.get(PlanEnrolment,plan.id)
        enrol.start_date=date(2025,1,31);enrol.end_date=end_date(enrol.start_date);plan_id=plan.id;db.commit()
        policy(db,admin)
        with patch.object(savings,'active',return_value=(0,{'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'})):
            row=savings.record(db,admin,Record(request_key=uuid4(),enrolment_id=plan.id,amount='5',currency='USD',payment_date=enrol.end_date-timedelta(days=1),method='TEST cash',reference='TEST-WITHDRAWAL-FUNDING'));db.commit()
        row=savings.action(db,admin,row['id'],'verify',Decision(request_key=uuid4(),base_event_id=0,outcome='Verified',evidence_reference='TEST-VERIFY',reason='Synthetic policy'));db.commit()
        row=savings.action(db,admin,row['id'],'reconcile',Decision(request_key=uuid4(),base_event_id=row['base_event_id'],outcome='Matched',evidence_reference='TEST-MATCH',reason='Synthetic policy',observed_amount='5',observed_currency='USD',observed_reference='TEST-WITHDRAWAL-FUNDING'));db.commit()
    # Requests have different keys: only one can reserve the same full balance.
    def request(_):
        with Session(engine) as db:
            try:
                result=withdrawals.request(db,db.get(User,member_id),RequestWithdrawal(request_key=uuid4(),enrolment_id=plan_id,amount='5',currency='USD',acknowledged=True));db.commit();return result
            except APIError as e:
                db.rollback();return {'conflict':e.status_code}
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(request,range(4)))
    assert sum('conflict' not in r for r in results)==1
    row=next(r for r in results if 'conflict' not in r)
    with Session(engine) as db:
        approval=WithdrawalDecision(request_key=uuid4(),base_event_id=row['base_event_id'],reason='TEST approval',evidence_reference='TEST approval')
        row=withdrawals.action(db,db.get(User,actor_id),row['id'],'approve',approval);db.commit()
    timestamp=datetime.fromisoformat(row['notice_ends_at']) if isinstance(row['notice_ends_at'],str) else row['notice_ends_at']
    def decide(kind,body):
        def work(_):
            with Session(engine) as db:
                result=withdrawals.action(db,db.get(User,actor_id),row['id'],kind,body);db.commit();return result
        with patch.object(withdrawals,'now',return_value=timestamp),ThreadPoolExecutor(max_workers=4) as pool:return list(pool.map(work,range(4)))[0]
    row=decide('process',WithdrawalDecision(request_key=uuid4(),base_event_id=row['base_event_id'],reason='TEST processing',evidence_reference='TEST processing'))
    from zoneinfo import ZoneInfo
    row=decide('record',WithdrawalDecision(request_key=uuid4(),base_event_id=row['base_event_id'],reason='TEST actual evidence',evidence_reference='TEST evidence',method='manual_cash',payment_date=timestamp.astimezone(ZoneInfo('Africa/Harare')).date(),payment_at=timestamp,payment_reference='TEST-CONCURRENT-PAYOUT'))
    row=decide('verify',WithdrawalDecision(request_key=uuid4(),base_event_id=row['base_event_id'],reason='TEST verification',evidence_reference='TEST verified'))
    with Session(engine) as db:
        assert db.query(WithdrawalRequest).count()==db.query(WithdrawalPayout).count()==db.query(WithdrawalDebit).count()==1
        assert db.query(WithdrawalEvent).count()==5
        assert withdrawals.funds(db,plan_id)=={'confirmed':'0.00','reserved':'0.00','available':'0.00'}
        assert db.query(SavingsLedgerEntry).count()==1
    for sql in ['UPDATE withdrawal_debits SET amount=-99','DELETE FROM withdrawal_debits','UPDATE withdrawal_events SET reason=\'changed\'','DELETE FROM withdrawal_requests','UPDATE withdrawal_requests SET amount=99','UPDATE withdrawal_payouts SET reference=\'changed\'']:
        with pytest.raises(DBAPIError),engine.begin() as c:c.execute(text(sql))
