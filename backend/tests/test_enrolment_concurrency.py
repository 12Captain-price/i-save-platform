"""Independent PostgreSQL transactions, not savepoint simulations."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4
import json
import pytest
from sqlalchemy.orm import Session
from app.database import Base
from app.migrations import upgrade
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.plan_draft import PlanDraft,PlanDraftVersion
from app.models.evidence_enrolment import PlanApproval,PlanPublication,PlanApplication,PlanEnrolment,PlanApplicationEvent
from app.models.contribution import Contribution
from app.models.subscription import Subscription
from app.models.registration_fee import RegistrationFee
from app.schemas.enrolment import PlanApply
from app.services import enrolment
from app.security.auth import now
from tests.test_migration_lifecycle import migration_database
from tests.test_plan_enrolment import COMPLETE


def test_concurrent_application_and_activation_are_single_events(migration_database):
    engine=migration_database
    if engine.dialect.name!='postgresql':pytest.skip('Concurrent row locks require PostgreSQL')
    assert engine.url.database.startswith('isave_test_')
    upgrade(engine)
    with Session(engine) as db:
        admin=bootstrap(db,'concurrent-admin@example.test','Synthetic-concurrency-only-123!')
        member_user=User(email='concurrent-member@example.test',role_id=db.query(Role).filter_by(name='member').one().id,is_active=True)
        db.add(member_user);db.flush()
        member=Member(member_number='CONCURRENT-ENROL',first_name='Synthetic',last_name='Concurrent',user_id=member_user.id)
        db.add(member);db.flush()
        app=MembershipApplication(application_number='CONCURRENT-MEMBERSHIP',member_id=member.id,first_name='Synthetic',last_name='Concurrent',email=member_user.email,status='Activated')
        db.add(app);db.flush()
        db.add(MembershipApproval(application_id=app.id,member_id=member.id,user_id=member_user.id,approved_by=admin.id,approver_email=admin.email,approved_at=now(),acknowledgement_version='synthetic',acknowledgement_text='Synthetic',activated_at=now()))
        draft=PlanDraft(latest_version=1);db.add(draft);db.flush()
        from app.schemas.plan_draft import DraftTerms
        version=PlanDraftVersion(draft_id=draft.id,version=1,request_key=str(uuid4()),snapshot=json.dumps(DraftTerms(**COMPLETE).model_dump(mode='json')),actor_id=admin.id,actor_email=admin.email)
        db.add(version);db.flush()
        db.add(PlanApproval(version_id=version.id,actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4())))
        db.flush();db.add(PlanPublication(version_id=version.id,actor_id=admin.id,actor_email=admin.email,request_key=str(uuid4()),request_snapshot='{}',effective_at=now()-timedelta(seconds=1)))
        db.commit();admin_id,member_user_id,version_id=admin.id,member_user.id,version.id
    def submit(_):
        with Session(engine) as db:
            body=PlanApply(request_key=uuid4(),version_id=version_id,weekly_target='8.50',acknowledged=True,acknowledgement_version='plan-application-v1')
            result=enrolment.apply(db,db.get(User,member_user_id),body);db.commit();return result['id']
    with ThreadPoolExecutor(max_workers=4) as pool:ids=list(pool.map(submit,range(4)))
    assert len(set(ids))==1
    with Session(engine) as db:
        row=db.get(PlanApplication,ids[0]);row.status='Approved';enrolment.record_event(db,db.get(User,admin_id),row,'Approved','Synthetic concurrent activation fixture');db.commit()
    def activate(_):
        with Session(engine) as db:
            result=enrolment.activate(db,db.get(User,admin_id),ids[0]);db.commit();return result['enrolment']['end_date']
    with ThreadPoolExecutor(max_workers=4) as pool:ends=list(pool.map(activate,range(4)))
    assert len(set(ends))==1
    with Session(engine) as db:
        assert db.query(PlanApplication).count()==db.query(PlanEnrolment).count()==1
        assert db.query(PlanApplicationEvent).filter_by(status='Active').count()==1
        assert [db.query(m).count() for m in [Contribution,Subscription,RegistrationFee]]==[0,0,0]
