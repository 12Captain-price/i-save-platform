from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import uuid4
import pytest
from sqlalchemy import text, event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.evidence_enrolment import PlanEnrolment
from app.models.savings import SavingsContribution,SavingsEvent,SavingsLedgerEntry
from app.schemas.savings import Record,Decision
from app.services import savings
from app.security.auth import now
from tests.test_migration_lifecycle import migration_database
from tests.test_enrolment_concurrency import test_concurrent_application_and_activation_are_single_events as seed_enrolment


def test_concurrent_post_verify_reconcile_reverse_and_append_only(migration_database):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('True row-lock concurrency requires PostgreSQL')
    seed_enrolment(engine)
    with Session(engine) as db:
        actor=db.query(User).filter_by(email='concurrent-admin@example.test').one();actor_id=actor.id
        enrolment=db.query(PlanEnrolment).one()
        body=Record(request_key=uuid4(),enrolment_id=enrolment.application_id,amount='5.00',currency='USD',payment_date=now().date(),method='Synthetic cash',reference='CONCURRENT-SYNTHETIC')
    def record(_):
        with Session(engine) as db:
            r=savings.record(db,db.get(User,actor_id),body);db.commit();return r
    with patch.object(savings,'active',return_value=(0,{'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'})):
        with ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(record,range(4)))
    assert len({r['id'] for r in rows})==1
    def run_action(action,body,distinct_keys=False):
        def execute(_):
            with Session(engine) as db:
                from app.exceptions import APIError
                request=body.model_copy(update={'request_key':uuid4()}) if distinct_keys else body
                try:r=savings.action(db,db.get(User,actor_id),rows[0]['id'],action,request);db.commit();return r
                except APIError as exc:
                    db.rollback()
                    assert distinct_keys and exc.status_code==409
                    return {'conflict':True}
        with ThreadPoolExecutor(max_workers=4) as pool:result=list(pool.map(execute,range(4)))
        if distinct_keys:assert sum('conflict' in r for r in result)==3
        return next(r for r in result if 'conflict' not in r)
    row=run_action('verify',Decision(request_key=uuid4(),base_event_id=0,outcome='Verified',evidence_reference='SYNTHETIC-VERIFY',reason='Synthetic approved relaxed policy'))
    row=run_action('reconcile',Decision(request_key=uuid4(),base_event_id=row['base_event_id'],outcome='Matched',evidence_reference='SYNTHETIC-MATCH',reason='Synthetic matched office evidence',observed_amount='5',observed_currency='USD',observed_reference='CONCURRENT-SYNTHETIC'),distinct_keys=True)
    with Session(engine) as db:
        assert db.query(SavingsContribution).count()==1 and db.query(SavingsLedgerEntry).count()==1
        assert savings.summary(db)['confirmed']==[{'currency':'USD','amount':'5.00'}]
    run_action('reverse',Decision(request_key=uuid4(),base_event_id=row['base_event_id'],outcome='Reversed',evidence_reference='SYNTHETIC-CORRECTION',reason='Duplicate correction protection'))
    with Session(engine) as db:
        assert db.query(SavingsEvent).count()==3 and db.query(SavingsLedgerEntry).count()==2
        assert savings.summary(db)['confirmed']==[{'currency':'USD','amount':'0.00'}]
    for statement in ['UPDATE savings_contributions SET amount=99','UPDATE savings_ledger_entries SET amount=99','DELETE FROM savings_ledger_entries','UPDATE savings_events SET reason=\'changed\'','DELETE FROM savings_events']:
        with pytest.raises(DBAPIError),engine.begin() as c:c.execute(text(statement))
    # A failed ledger insertion rolls back status, event and audit together, so
    # the same reconciliation key can safely be retried after recovery.
    with Session(engine) as db,patch.object(savings,'active',return_value=(0,{'savings_separation':'same_actor_allowed','savings_week_start':'enrolment_start'})):
        next_body=body.model_copy(update={'request_key':uuid4(),'reference':'ATOMIC-SYNTHETIC'})
        second=savings.record(db,db.get(User,actor_id),next_body);db.commit()
        second=savings.action(db,db.get(User,actor_id),second['id'],'verify',Decision(request_key=uuid4(),base_event_id=0,outcome='Verified',evidence_reference='SYNTHETIC',reason='Atomic verification fixture'));db.commit()
        match=Decision(request_key=uuid4(),base_event_id=second['base_event_id'],outcome='Matched',evidence_reference='SYNTHETIC',reason='Atomic confirmation fixture',observed_amount='5',observed_currency='USD',observed_reference='ATOMIC-SYNTHETIC')
        def fail_post(session,context,instances):
            if any(isinstance(r,SavingsLedgerEntry) for r in session.new):raise RuntimeError('Synthetic posting failure')
        event.listen(db,'before_flush',fail_post)
        with pytest.raises(RuntimeError,match='Synthetic posting failure'):savings.action(db,db.get(User,actor_id),second['id'],'reconcile',match)
        db.rollback();event.remove(db,'before_flush',fail_post)
        assert db.get(SavingsContribution,second['id']).status=='Verified'
        assert db.query(SavingsEvent).filter_by(request_key=str(match.request_key)).count()==0
        assert db.query(SavingsLedgerEntry).filter_by(contribution_id=second['id']).count()==0
        savings.action(db,db.get(User,actor_id),second['id'],'reconcile',match);db.commit()
        assert db.query(SavingsLedgerEntry).filter_by(contribution_id=second['id']).count()==1
