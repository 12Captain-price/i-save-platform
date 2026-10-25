// Read synthetic workflow evidence; one explicit local-capture test, no external mail.
const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const report={checks:[],completed:false};
const py=code=>execFileSync('docker',['exec','-i','isave-content-rehearsal-backend-1','python','-'],{input:code,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
(async()=>{let token;try{
 const data=JSON.parse(py(`import json,secrets
from datetime import timedelta
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.auth import AuthSession
from app.models.account_workflows import Notification
from app.models.content_support import ContentItem,ContentVersion,ContentEvent,SupportTicket,TicketEvent,TicketMessage
from app.services.content_support import public_items
from app.security.auth import now,digest
assert engine.url.database=='isave_test_browser' and engine.url.host=='db'
with Session(engine) as db:
 assert db.query(ContentItem).count()==1 and db.query(ContentVersion).count()==2
 assert public_items(db)[0]['version']==1 and db.query(ContentVersion).filter_by(version=2).one().id not in [e.version_id for e in db.query(ContentEvent).filter_by(state='Published')]
 assert db.query(SupportTicket).count()==1 and db.query(TicketEvent).count()==3 and db.query(TicketMessage).count()==3
 assert db.query(TicketMessage).filter_by(internal=True).count()==1
 notices=db.query(Notification).all();assert len({n.event_key for n in notices})==len(notices)
 assert all('TEST ONLY' not in n.message and 'Synthetic member question' not in n.message for n in notices)
 admin=db.query(User).filter_by(email='accounts-admin@example.test').one();member=db.query(User).filter_by(email='accounts-member@example.test').one()
 notice=db.query(Notification).filter_by(user_id=member.id,screen='support').one()
 assert db.query(AuthSession).filter(AuthSession.user_id==admin.id,AuthSession.revoked_at.is_not(None)).count()>=2
 assert db.query(AuthSession).filter(AuthSession.user_id==member.id,AuthSession.revoked_at.is_not(None)).count()>=1
 # Clean only the fixture session left by the interrupted first automation.
 for session in db.query(AuthSession).filter(AuthSession.user_id.in_([admin.id,member.id]),AuthSession.revoked_at.is_(None)):session.revoked_at=now()
 token=secrets.token_urlsafe(32);db.add(AuthSession(token_hash=digest(token),user_id=admin.id,expires_at=now()+timedelta(minutes=5)));db.commit()
 print(json.dumps({'token':token,'notification':notice.id,'versions':2,'ticket_events':3,'messages':3,'notices':len(notices)}))
`));token=data.token;check('published v1 and private v2 preserved; one ticket with immutable conversation',data.versions===2&&data.ticket_events===3&&data.messages===3);check('browser sessions revoked and unique privacy-safe notices persisted',true);
 const mailbox=async()=>{const r=await fetch('http://127.0.0.1:18025/api/v1/messages');if(!r.ok)throw Error('Local inbox unavailable');return r.json();};const before=await mailbox();
 for(let i=0;i<2;i++){const r=await fetch('http://127.0.0.1:18070/api/v1/admin/notification-deliveries/'+data.notification+'/retry',{method:'POST',headers:{Authorization:'Bearer '+token}});check(i?'repeated capture request is safely acknowledged':'explicit local Mailpit capture accepted',r.ok&&(await r.json()).state==='Mailpit accepted');}
 const after=await mailbox();check('exactly one new message captured for repeated request',after.total===before.total+1);
 const status=py(`from sqlalchemy.orm import Session
from app.database import engine
from app.models.account_workflows import Notification
assert engine.url.database=='isave_test_browser'
with Session(engine) as db:
 n=db.get(Notification,${data.notification});assert n.delivery_attempts==1 and n.delivery_state=='Mailpit accepted'
print('ok')`);check('one delivery attempt retained',status.trim()==='ok');
 const logout=await fetch('http://127.0.0.1:18070/api/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});check('probe logout and replay denial',logout.status===204&&(await fetch('http://127.0.0.1:18070/api/v1/auth/me',{headers:{Authorization:'Bearer '+token}})).status===401);report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Synthetic event check stopped; no private details emitted';console.error(report.failure);process.exitCode=1;}finally{if(token)await fetch('http://127.0.0.1:18070/api/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});fs.mkdirSync('docs/content-support',{recursive:true});fs.writeFileSync('docs/content-support/events.json',JSON.stringify(report,null,2)+'\n');}})();
