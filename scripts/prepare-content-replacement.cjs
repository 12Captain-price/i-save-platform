// One-shot synthetic fixture setup. No normal connections, credentials or tokens.
const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const project='isave-content-replacement-20261025',database='isave_test_content_replacement_20261025';
const evidence='docs/content-support/replacement-20261025';
const report={project,database,replacement_not_restore:true,checks:[],completed:false};
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
const python=code=>run(['exec','-i',project+'-backend-1','python','-'],code);
(async()=>{try{
 const preflight=JSON.parse(fs.readFileSync(evidence+'/preflight.json','utf8'));check('pre-creation isolation checks retained',preflight.verified_before_creation&&preflight.database===database);
 const containers=JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>project+'-'+s+'-1')]));
 check('only dedicated project containers',containers.every(c=>c.Config.Labels['com.docker.compose.project']===project));
 const db=containers[0];check('dedicated persistent PostgreSQL mount',!Object.keys(db.HostConfig.Tmpfs??{}).length&&db.Mounts.some(m=>m.Type==='volume'&&m.Name==='isave-content-replacement-20261025-pg-7d9c2e1a'&&m.Destination==='/var/lib/postgresql/data'));
 check('no normal project network attached',containers.every(c=>Object.keys(c.NetworkSettings.Networks).every(n=>n===project+'-private')));
 const result=JSON.parse(python(`import json,secrets
from uuid import uuid4
from sqlalchemy.orm import Session
from app.database import engine
from app.migrations import require_current_schema
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.content_support import ContentItem,ContentVersion,ContentEvent,SupportTicket,TicketMessage
from app.models.account_workflows import AccountLink
from app.schemas.content_support import SaveContent,ContentDecision,CreateTicket
from app.services import content_support as service
from app.security.auth import TEMPLATES,now
from app.security.hashing import hash_password
assert engine.url.host=='db' and engine.url.database=='${database}'
require_current_schema(engine)
with Session(engine) as db:
 assert db.query(User).count()==0 and db.query(ContentItem).count()==0 and db.query(SupportTicket).count()==0,'Existing fixture records must not be reset or reseeded'
 users={}
 for role_name,email in [('administrator','accounts-admin@example.test'),('member','accounts-member@example.test')]:
  role=Role(name=role_name);db.add(role);db.flush()
  for code in TEMPLATES[role_name]:
   p=db.query(Permission).filter_by(code=code).one_or_none()
   if not p:p=Permission(code=code);db.add(p);db.flush()
   db.add(RolePermission(role_id=role.id,permission_id=p.id))
  user=User(email=email,role_id=role.id,is_active=True,password_hash=hash_password(secrets.token_urlsafe(48)))
  db.add(user);db.flush();users[role_name]=user
 db.flush()
 admin=users['administrator'];member=users['member']
 row=service.save_content(db,admin,SaveContent(kind='announcement',fields={'title':'TEST ONLY replacement announcement','body':'Published synthetic replacement rehearsal announcement. No normal organisation content is changed.'},request_key=uuid4()))
 for action in ['submit','approve','publish']:
  row=service.content_decision(db,admin,row['id'],ContentDecision(action=action,base_event=row['base_event'],reason='TEST ONLY replacement fixture; not an operator approval or restored evidence',effective_at=now() if action=='publish' else None,request_key=uuid4()))
 draft=service.save_content(db,admin,SaveContent(item_id=row['item_id'],base_version=1,kind='announcement',fields={'title':'TEST ONLY replacement announcement','body':'TEST ONLY UNPUBLISHED replacement edit. This text must remain absent from public Announcements.'},request_key=uuid4()))
 ticket=service.create_ticket(db,member,CreateTicket(category='Other',subject='TEST ONLY replacement support ticket',message='Synthetic member question prepared for one manual office reply. No private documents or financial transaction.',request_key=uuid4()))
 db.commit()
 assert service.public_items(db)[0]['version']==1 and draft['state']=='Draft'
 print(json.dumps({'users':db.query(User).count(),'content_items':db.query(ContentItem).count(),'versions':db.query(ContentVersion).count(),'editorial_events':db.query(ContentEvent).count(),'tickets':db.query(SupportTicket).count(),'messages':db.query(TicketMessage).count(),'ticket_id':ticket['id']}))
`));check('minimum fresh fixture: two accounts, one announcement/two versions, one ticket',result.users===2&&result.content_items===1&&result.versions===2&&result.editorial_events===3&&result.tickets===1&&result.messages===1);report.fixture=result;
 // Standard generic recovery queue; no passwords or private links are returned.
 for(const email of ['accounts-admin@example.test','accounts-member@example.test']){
  const response=await fetch('http://127.0.0.1:18070/api/v1/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,request_key:crypto.randomUUID()})});check('synthetic private password-setup request accepted '+(email.includes('admin')?'Admin':'Member'),response.ok);
 }
 let accepted=false;
 for(let i=0;i<30;i++){
  const status=JSON.parse(python(`import json
from sqlalchemy.orm import Session
from app.database import engine
from app.models.account_workflows import AccountLink,RecoveryRequest
assert engine.url.database=='${database}'
with Session(engine) as db:print(json.dumps({'links':db.query(AccountLink).count(),'accepted':db.query(AccountLink).filter_by(delivery_state='Mailpit accepted').count(),'completed':db.query(RecoveryRequest).filter_by(state='Completed').count()}))`));
  if(status.links===2&&status.accepted===2&&status.completed===2){accepted=true;break;}await new Promise(r=>setTimeout(r,1000));
 }
 check('two single-use setup links accepted by local Mailpit',accepted);
 const inbox=await fetch('http://127.0.0.1:18025/api/v1/messages');const messages=await inbox.json();check('two setup messages captured in the isolated inbox',messages.total===2);report.captured_messages=2;
 report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Fixture checkpoint stopped safely; inspect synthetic state before retrying; do not reset accounts';console.error(report.failure);process.exitCode=1;}finally{fs.writeFileSync(evidence+'/setup.json',JSON.stringify(report,null,2)+'\n');}})();
