// Final private preservation and stop ONLY; never remove containers or volumes.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project='isave-content-replacement-20261025',database='isave_test_content_replacement_20261025';
const evidence='docs/content-support/replacement-20261025',compose=['compose','-p',project,'-f','compose.content-replacement.yaml'];
const report={project,database,checks:[],completed:false,operator_member_logout_confirmed:true};
const run=(a,input,encoding='utf8')=>execFileSync('docker',a,{input,encoding,stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
const normalState=()=>JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1')])).map(c=>({id:c.Id,name:c.Name,started_at:c.State.StartedAt,running:c.State.Running}));
(async()=>{try{
 const initialNormal=normalState();
 const checkpoint=JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE,'isave-backups','content-replacement-20261025-checkpoint','logout-checkpoint.json'),'utf8'));
 check('private checkpoint targets only this replacement',checkpoint.project===project&&checkpoint.database===database&&checkpoint.member_session_hashes.length===1);
 const result=JSON.parse(run(['exec','-i',project+'-backend-1','python','-c',`import json,sys,hashlib
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import engine
from app.models.auth import AuthSession
from app.models.user import User
from app.models.content_support import SupportTicket,TicketMessage,TicketEvent,ContentVersion,ContentEvent
from app.models.audit_event import AuditEvent
from app.services.content_support import public_items
from app.security.auth import validate_session,aware,now
from app.exceptions import APIError
assert engine.url.database=='${database}' and engine.url.host=='db'
checkpoint=json.load(sys.stdin)
with Session(engine) as db:
 assert checkpoint['database']=='${database}' and checkpoint['project']=='${project}'
 for identifier in checkpoint['member_session_hashes']:
  session=db.get(AuthSession,identifier);assert session and session.revoked_at,'Checkpointed Member session is not revoked'
  try:validate_session(session)
  except APIError as exc:assert exc.status_code==401
  else:raise AssertionError('Revoked Member session accepted')
 for identifier in checkpoint['all_session_hashes']:
  session=db.get(AuthSession,identifier);assert session and session.revoked_at
 assert not [s for s in db.query(AuthSession) if not s.revoked_at and aware(s.expires_at)>now()],'A live rehearsal session remains'
 admin=db.query(User).filter_by(email='accounts-admin@example.test').one();member=db.query(User).filter_by(email='accounts-member@example.test').one();assert db.query(User).count()==2
 ticket=db.query(SupportTicket).one();assert ticket.user_id==member.id and ticket.status=='Open'
 assert db.query(TicketMessage).filter_by(ticket_id=ticket.id).count()==3
 assert db.query(TicketEvent).filter_by(ticket_id=ticket.id,action='reply',actor_id=admin.id).count()==1
 assert db.query(TicketEvent).filter_by(ticket_id=ticket.id,action='reply',actor_id=member.id).count()==1
 assert db.query(AuditEvent).filter_by(action='support_reply',actor_user_id=admin.id,target_id=str(ticket.id)).count()==1
 assert db.query(ContentVersion).count()==2 and db.query(ContentEvent).count()==3
 public=public_items(db,'announcement');assert len(public)==1 and public[0]['version']==1 and 'UNPUBLISHED' not in json.dumps(public,default=str)
 financial=['savings_contributions','savings_ledger_entries','withdrawal_requests','withdrawal_payouts','subscription_fee_payments','application_registration_payments'];assert all(db.execute(text('select count(*) from '+t)).scalar()==0 for t in financial)
 hashes={}
 for t in ['content_versions','content_events','permissions','role_permissions','user_permissions']:
  rows=sorted(db.execute(text('select row_to_json(t)::text from '+t+' t')).scalars());hashes[t]=hashlib.sha256('\\n'.join(rows).encode()).hexdigest()
 print(json.dumps({'member_checkpoint_revoked':True,'session_validation_status':401,'all_checkpoint_sessions_revoked':True,'live_sessions':0,'users':2,'content_versions':2,'public_version':1,'ticket_messages':3,'office_replies':1,'member_followups':1,'financial_records':0,'hashes':hashes}))`],JSON.stringify(checkpoint)));
 check('checkpointed Member session revoked and server validation rejects it401',result.member_checkpoint_revoked&&result.session_validation_status===401);
 check('all checkpointed sessions revoked; no live rehearsal sessions',result.all_checkpoint_sessions_revoked&&result.live_sessions===0);
 const earlier=JSON.parse(fs.readFileSync(evidence+'/manual-before-logout.json','utf8')).database_evidence;
 check('private drafts, publication history and permissions preserved',same(result.hashes,earlier.hashes));
 check('one office reply and Member follow-up retained; no financial postings',result.ticket_messages===3&&result.office_replies===1&&result.member_followups===1&&result.financial_records===0);report.final_database_checks=result;
 run([...compose,'stop','frontend','account-worker','backend','mailpit']);
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
 const directory=path.join(process.env.USERPROFILE,'isave-backups','content-replacement-final-'+stamp);fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 const dump=run(['exec',project+'-db-1','pg_dump','-U','postgres','-d',database,'-Fc','--no-owner'],undefined,null);
 const file=path.join(directory,'rehearsal.dump');fs.writeFileSync(file,dump);check('private final backup saved byte-for-byte',dump.subarray(0,5).toString()==='PGDMP'&&dump.equals(fs.readFileSync(file)));
 run(['exec','-i',project+'-db-1','pg_restore','--no-owner','--file=/dev/null'],dump);
 check('complete backup archive decodes without database writes',true);
 const mail=run(['cp',project+'-mailpit-1:/data/.','-'],undefined,null);check('stopped Mailpit database archived privately',mail.length>1024);fs.writeFileSync(path.join(directory,'mailpit-data.tar'),mail);
 report.private_preservation={directory,database_dump:{bytes:dump.length,sha256:crypto.createHash('sha256').update(dump).digest('hex')},mail_archive:{bytes:mail.length,sha256:crypto.createHash('sha256').update(mail).digest('hex')},independent_final_restore_run:false};
 fs.writeFileSync(path.join(directory,'final-verification.json'),JSON.stringify(result,null,2));
 run([...compose,'stop','db']);
 const stopped=JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>project+'-'+s+'-1')]));check('only replacement stack stopped with all containers retained',stopped.every(c=>c.Config.Labels['com.docker.compose.project']===project&&!c.State.Running));report.services=stopped.map(c=>({name:c.Name.slice(1),running:c.State.Running}));
 const volumes=['isave-content-replacement-20261025-pg-7d9c2e1a','isave-content-replacement-20261025-mail-7d9c2e1a'];const saved=JSON.parse(run(['volume','inspect',...volumes]));check('both dedicated persistent volumes retained',saved.length===2&&saved.every(v=>volumes.includes(v.Name)));report.retained_volumes=volumes;
 check('normal service identities, start times and states unchanged',same(initialNormal,normalState()));report.normal_services=normalState();report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Final closure stopped safely; no private identifiers or request details emitted';console.error(report.failure);process.exitCode=1;}finally{fs.writeFileSync(evidence+'/closure.json',JSON.stringify(report,null,2)+'\n');}})();
