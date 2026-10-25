"""True PostgreSQL campaign editing, queue, dispatch and opt-out races."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from unittest.mock import Mock
import secrets
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from app.migrations import upgrade
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.campaign import Campaign,CampaignRecipient,CampaignEvent,CampaignVersion,MarketingConsentEvent
from app.schemas.content_support import SaveContent,ContentDecision
from app.schemas.campaign import SaveCampaign,CampaignDecision,Preference,CONSENT_VERSION
from app.services import campaigns as service,content_support
from app.security.auth import now
from app.exceptions import APIError
from tests.test_migration_lifecycle import migration_database

def test_campaign_migration_preflights_older_delegated_history(migration_database):
 from alembic import command
 from app.migrations import migration_config,require_current_schema
 engine=migration_database;upgrade(engine)
 with engine.begin() as c:
  c.execute(text("INSERT INTO roles(name) VALUES ('staff')"))
  c.execute(text("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.name='staff' AND p.code='content:read'"))
 with pytest.raises(RuntimeError,match='permission history is retained'),engine.connect() as c:command.downgrade(migration_config(c),'0015_account_workflows')
 require_current_schema(engine)

def test_concurrent_campaign_queue_dispatch_unsubscribe_and_immutable_history(migration_database,monkeypatch):
 engine=migration_database
 if engine.dialect.name!='postgresql':pytest.skip('Campaign worker races require PostgreSQL row locks')
 upgrade(engine);mailer=Mock(available=True,mode='mailpit');monkeypatch.setattr(service,'delivery_available',lambda:True);monkeypatch.setattr(service,'get_invitation_mailer',lambda:mailer)
 with Session(engine) as db:
  admin=bootstrap(db,'campaign-race-admin@example.test',secrets.token_urlsafe(32));member=User(email='campaign-race-member@example.test',role_id=db.query(Role).filter_by(name='member').one().id,is_active=True);db.add(member);db.flush();aid,mid=admin.id,member.id
  content=content_support.save_content(db,admin,SaveContent(kind='event',fields={'title':'TEST ONLY race event','body':'Synthetic event','event_status':'Scheduled','location':'TEST ONLY room','starts_at':now().isoformat()},request_key=uuid4()))
  for action in ['submit','approve','publish']:content=content_support.content_decision(db,admin,content['id'],ContentDecision(action=action,base_event=content['base_event'],reason='TEST ONLY',effective_at=now() if action=='publish' else None,request_key=uuid4()))
  service.change_preference(db,member,Preference(enabled=True,base_revision=0,version=CONSENT_VERSION,request_key=uuid4()))
  body=SaveCampaign(content_version_id=content['id'],fields={'subject':'TEST ONLY race','message':'Synthetic campaign'},request_key=uuid4());c=service.save(db,admin,body);db.commit();cid=c['id']
 def edit(_):
  with Session(engine) as db:
   try:service.save(db,db.get(User,aid),body.model_copy(update={'campaign_id':cid,'base_version':1,'request_key':uuid4()}));db.commit();return 200
   except APIError:db.rollback();return 409
 with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(edit,range(2)))==[200,409]
 with Session(engine) as db:
  admin=db.get(User,aid);c=service.decision(db,admin,cid,CampaignDecision(action='approve',base_event=0,reason='TEST ONLY approval',request_key=uuid4()));db.commit();preview=service.preview(db,db.get(Campaign,cid));queue=CampaignDecision(action='queue',base_event=c['base_event'],reason='TEST ONLY queue',confirm=True,preview_digest=preview['preview_digest'],request_key=uuid4())
 def queue_once(_):
  with Session(engine) as db:r=service.decision(db,db.get(User,aid),cid,queue);db.commit();return r['id']
 with ThreadPoolExecutor(2) as pool:assert list(pool.map(queue_once,range(2)))==[cid,cid]
 def dispatch(_):
  with Session(engine) as db:return service.process_one(db)
 with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(dispatch,range(2)))==[False,True]
 assert mailer.send_campaign.call_count==1;token=mailer.send_campaign.call_args.kwargs['unsubscribe_token']
 def unsubscribe(_):
  with Session(engine) as db:service.unsubscribe(db,token);db.commit()
 with ThreadPoolExecutor(2) as pool:list(pool.map(unsubscribe,range(2)))
 with Session(engine) as db:
  assert db.query(CampaignRecipient).count()==1 and db.query(CampaignRecipient).one().attempts==1
  assert db.query(CampaignEvent).filter_by(action='queue').count()==1
  assert db.query(CampaignVersion).count()==2
  assert db.query(MarketingConsentEvent).filter_by(source='email_unsubscribe').count()==1
 for table in ['marketing_consent_events','campaign_versions','campaign_events','campaign_delivery_events']:
  with pytest.raises(DBAPIError),engine.begin() as c:c.execute(text('DELETE FROM '+table))
