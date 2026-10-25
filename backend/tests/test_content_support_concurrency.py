from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from app.migrations import upgrade
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.security.auth import TEMPLATES
from app.models.content_support import ContentVersion,TicketMessage,TicketEvent
from app.schemas.content_support import SaveContent,CreateTicket,TicketAction
from app.services import content_support as service
from app.exceptions import APIError
from tests.test_migration_lifecycle import migration_database

def test_concurrent_edits_retries_and_immutable_history(migration_database):
 engine=migration_database
 if engine.dialect.name!='postgresql':pytest.skip('True row locks require PostgreSQL')
 upgrade(engine)
 with Session(engine) as db:
  for name in ['administrator','member']:
   role=Role(name=name);db.add(role);db.flush()
   for code in TEMPLATES[name]:
    permission=db.query(Permission).filter_by(code=code).one_or_none()
    if not permission:permission=Permission(code=code);db.add(permission);db.flush()
    db.add(RolePermission(role_id=role.id,permission_id=permission.id))
  db.flush()
  admin=User(email='editor@example.test',role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True)
  member=User(email='support@example.test',role_id=db.query(Role).filter_by(name='member').one().id,is_active=True)
  db.add_all([admin,member]);db.flush();aid,mid=admin.id,member.id
  row=service.save_content(db,admin,SaveContent(kind='announcement',fields={'title':'TEST ONLY','body':'Synthetic'},request_key=uuid4()))
  ticket=service.create_ticket(db,member,CreateTicket(category='Other',subject='TEST ONLY',message='Synthetic',request_key=uuid4()));db.commit()
 def edit(_):
  with Session(engine) as db:
   try:
    r=service.save_content(db,db.get(User,aid),SaveContent(kind='announcement',item_id=row['item_id'],base_version=1,fields={'title':'TEST ONLY race','body':'Synthetic'},request_key=uuid4()));db.commit();return 200
   except APIError:db.rollback();return 409
 with ThreadPoolExecutor(2) as pool:assert sorted(pool.map(edit,range(2)))==[200,409]
 key=uuid4();body=TicketAction(action='reply',base_revision=ticket['revision'],message='TEST ONLY reply',request_key=key)
 def reply(_):
  with Session(engine) as db:
   r=service.ticket_action(db,db.get(User,mid),ticket['id'],body);db.commit();return r['revision']
 with ThreadPoolExecutor(2) as pool:assert list(pool.map(reply,range(2)))==[2,2]
 with Session(engine) as db:
  assert db.query(ContentVersion).count()==2
  assert db.query(TicketMessage).count()==2
  assert db.query(TicketEvent).filter_by(request_key=str(key)).count()==1
 for table in ['content_versions','ticket_events','ticket_messages']:
  with pytest.raises(DBAPIError),engine.begin() as c:c.execute(text('DELETE FROM '+table))
