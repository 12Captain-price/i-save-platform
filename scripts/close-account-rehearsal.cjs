// Close only the named disposable rehearsal after private preservation.
// Never emit email bodies, links, tokens, headers, environment values or DB rows.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project='isave-accounts-rehearsal';
const names=['frontend','backend','worker','mailpit','db'].map(s=>project+'-'+s+'-1');
const normalNames=['frontend','backend','account-worker','db','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
const recovery='isave-accounts-final-restore-'+stamp;
const report={started_at:new Date().toISOString(),project,checks:[],completed:false};
let directory;
const run=(args,input,encoding='utf8')=>execFileSync('docker',args,{input,encoding,stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
const inspect=items=>JSON.parse(run(['inspect',...items]));
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
const state=items=>inspect(items).map(c=>({name:c.Name.slice(1),id:c.Id,started_at:c.State.StartedAt,running:c.State.Running,health:c.State.Health?.Status??'not configured'}));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const verification=`
import json
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.auth import AuthSession,UserPermission
from app.models.permission import Permission
from app.models.account_workflows import Notification,RecoveryRequest
from app.models.audit_event import AuditEvent
from app.security.auth import now,aware,validate_session,permissions
from app.exceptions import APIError
assert engine.url.host=='db' and engine.url.database=='isave_test_browser'
with Session(engine) as db:
 admin=db.query(User).filter_by(email='accounts-admin@example.test').one()
 staff=db.query(User).filter_by(email='accounts-staff@example.test').one()
 n=db.get(Notification,14)
 assert n and n.user_id==admin.id and n.read and n.delivery_state=='Mailpit accepted' and n.delivery_attempts==1
 delivery=db.query(AuditEvent).filter_by(action='notification_delivery_attempt',target_table='notifications',target_id='14').all()
 assert len(delivery)==1 and delivery[0].actor_user_id==admin.id
 logout=db.query(AuditEvent).filter_by(action='logout',actor_user_id=admin.id).order_by(AuditEvent.id.desc()).first()
 assert logout and logout.created_at>=delivery[0].created_at
 sessions=db.query(AuthSession).all()
 live=[s for s in sessions if not s.revoked_at and aware(s.expires_at)>now()]
 assert not live
 correlated=[s for s in sessions if s.user_id==admin.id and s.revoked_at and abs((aware(s.revoked_at)-aware(logout.created_at)).total_seconds())<2]
 assert len(correlated)==1
 rejected=0
 for session in sessions:
  try:validate_session(session)
  except APIError as error:
   assert error.status_code==401;rejected+=1
 assert rejected==len(sessions)
 overrides=dict(db.query(Permission.code,UserPermission.allowed).join(UserPermission,UserPermission.permission_id==Permission.id).filter(UserPermission.user_id==staff.id).all())
 assert staff.is_active and overrides=={'members:read':False} and 'members:read' not in permissions(db,staff)
 own=db.query(Notification).filter_by(user_id=admin.id).all()
 assert len(own)==6 and sum(not row.read for row in own)==5
 assert db.query(RecoveryRequest).filter(RecoveryRequest.state.in_(['Pending','Claimed'])).count()==0
 financial={}
 from sqlalchemy import text
 for table in ['application_registration_payments','registration_fees','subscriptions','subscription_fee_payments','contributions','savings_contributions','savings_ledger_entries','withdrawal_requests','withdrawal_payouts','withdrawal_debits']:
  financial[table]=db.execute(text('SELECT count(*) FROM '+table)).scalar()
 assert not any(financial.values())
 print(json.dumps({'notification':{'id':14,'state':n.delivery_state,'attempts':n.delivery_attempts,'audit_event_id':delivery[0].id,'actor_is_rehearsal_admin':True},'logout':{'audit_event_id':logout.id,'at':aware(logout.created_at).isoformat(),'matching_revoked_session_count':len(correlated),'live_sessions_all_accounts':len(live),'stored_sessions_rejected_by_guard':rejected,'historical_expired_unrevoked_sessions':sum(not s.revoked_at and aware(s.expires_at)<=now() for s in sessions)},'staff':{'active':True,'members_read_denied':True,'effective_permissions':sorted(permissions(db,staff))},'admin_notifications':{'total':6,'unread':5,'read':1},'pending_or_claimed_recovery_jobs':0,'financial_row_counts':financial}))
`;

async function inbox(){
 const result=[];
 for(let start=0;start<10000;start+=100){
  const response=await fetch('http://127.0.0.1:18025/api/v1/messages?start='+start+'&limit=100',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Disposable inbox unavailable');
  const data=await response.json();if(!Array.isArray(data.messages))throw Error('Disposable inbox schema');
  result.push(...data.messages);if(data.messages.length<100)break;
 }
 return result;
}
function sameSnapshot(a,b){return a.revision===b.revision&&equal(a.tables,b.tables)&&equal(a.sequences,b.sequences)&&equal(a.permissions,b.permissions);}

(async()=>{try{
 const normalBefore=state(normalNames);
 check('normal services running before rehearsal closure',normalBefore.every(s=>s.running&&(s.health==='healthy'||s.health==='not configured')));
 const targets=inspect(names);
 check('five exact disposable containers; no normal data mounts',targets.every(c=>c.Config.Labels?.['com.docker.compose.project']===project&&c.State.Running&&!c.Mounts.some(m=>m.Name==='i_save_postgres_data')));
 const byService=Object.fromEntries(targets.map(c=>[c.Config.Labels['com.docker.compose.service'],c]));
 check('inbox binding belongs only to rehearsal localhost18025',byService.mailpit.NetworkSettings.Ports['8025/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='18025'));
 report.database_evidence=JSON.parse(run(['exec','-i',byService.backend.Id,'python','-'],verification));
 check('single capture/audit, logout revocation, saved denial and no financial records',!!report.database_evidence);
 directory=path.join(process.env.USERPROFILE,'isave-backups','accounts-rehearsal-final-'+stamp);
 fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 report.private_directory=directory;
 // Quiesce only disposable writers. Keep its tmpfs PostgreSQL alive until the
 // saved Windows archive has been independently restored and compared.
 run(['stop',byService.frontend.Id,byService.backend.Id,byService.worker.Id]);
 report.disposable_writers_stopped=true;
 const databaseNetwork=Object.keys(byService.db.NetworkSettings.Networks).find(n=>n.endsWith('_default'));
 check('dedicated disposable database network',databaseNetwork===project+'_default');
 const source=(code)=>run(['run','--rm','--network',databaseNetwork,'-e','DATABASE_URL=postgresql+psycopg://postgres@db:5432/isave_test_browser','--entrypoint','python',byService.backend.Image,'-c',"from app.database import engine; assert engine.url.host=='db' and engine.url.database=='isave_test_browser';\n"+code]);
 const snapshot=require('./withdrawal-snapshot.cjs');
 const before=JSON.parse(source(snapshot));check('rehearsal frozen at migration0015',before.revision==='0015_account_workflows');
 const dump=run(['exec',byService.db.Id,'pg_dump','-U','postgres','-d','isave_test_browser','-Fc','--no-owner'],undefined,null);
 const archive=path.join(directory,'rehearsal.dump');fs.writeFileSync(archive,dump);
 check('private PostgreSQL archive saved exactly',dump.subarray(0,5).toString()==='PGDMP'&&dump.equals(fs.readFileSync(archive)));
 report.backup={path:archive,bytes:dump.length,sha256:crypto.createHash('sha256').update(dump).digest('hex')};
 fs.writeFileSync(path.join(directory,'database-fingerprint.json'),JSON.stringify(before,null,2));
 const messages=await inbox();
 check('inbox list has unique capture identities',new Set(messages.map(m=>m.ID)).size===messages.length);
 const messageDirectory=path.join(directory,'mailpit');fs.mkdirSync(messageDirectory);
 fs.writeFileSync(path.join(messageDirectory,'index.json'),JSON.stringify(messages,null,2));
 let matched=0;const hashes=[];
 for(let i=0;i<messages.length;i++){
  const message=messages[i];
  const response=await fetch('http://127.0.0.1:18025/api/v1/message/'+encodeURIComponent(message.ID)+'/raw',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Private inbox archive failed');
  const raw=Buffer.from(await response.arrayBuffer());
  if(/^message-id:\s*<?isave-notice-14@local\.test>?\s*$/im.test(raw.toString('utf8')))matched++;
  const filename=String(i+1).padStart(4,'0')+'.eml';fs.writeFileSync(path.join(messageDirectory,filename),raw);
  hashes.push({filename,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
 }
 fs.writeFileSync(path.join(messageDirectory,'manifest.json'),JSON.stringify(hashes,null,2));
 check('exactly one captured email for notification14',matched===1);
 check('inbox stable during private preservation',equal(messages.map(m=>m.ID).sort(),(await inbox()).map(m=>m.ID).sort()));
 report.mailpit={private_raw_messages_archived:messages.length,notification14_captures:matched,external_delivery_claimed:false};
 for(const file of ['compose.auth-test.yaml','compose.mailpit-test.yaml','compose.accounts-test.yaml'])fs.copyFileSync(file,path.join(directory,file));
 report.container_images=targets.map(c=>({service:c.Config.Labels['com.docker.compose.service'],image:c.Image}));
 run(['run','-d','--name',recovery,'--network','none','-e','POSTGRES_DB=isave_recovery_accounts_final','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=volume,src='+recovery+'-data,dst=/var/lib/postgresql/data','postgres:16-alpine']);
 report.recovery_container=recovery;
 for(let i=0;i<30;i++){try{run(['exec',recovery,'pg_isready','-U','postgres','-d','isave_recovery_accounts_final']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 run(['cp',archive,recovery+':/tmp/rehearsal.dump']);
 run(['exec',recovery,'pg_restore','-U','postgres','-d','isave_recovery_accounts_final','--no-owner','--exit-on-error','/tmp/rehearsal.dump']);
 const restored=(code)=>run(['run','--rm','--network','container:'+recovery,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_recovery_accounts_final','--entrypoint','python',byService.backend.Image,'-c',code]);
 const recovered=JSON.parse(restored(snapshot));
 check('independent restore matches every row/schema/sequence/grant fingerprint',sameSnapshot(before,recovered));
 restored('from app.database import engine; from app.migrations import require_current_schema; require_current_schema(engine)');
 check('restored schema passes current migration structure gate',true);
 check('source rehearsal unchanged during backup/restore',sameSnapshot(before,JSON.parse(source(snapshot))));
 // The only memory-backed database is stopped after successful independent
 // restoration; no container, named volume or image is deleted.
 run(['stop',byService.mailpit.Id,byService.db.Id]);
 run(['stop',recovery]);
 check('only rehearsal containers stopped; retained restore stopped',inspect(names.concat(recovery)).every(c=>!c.State.Running));
 const normalAfter=state(normalNames);
 check('normal services IDs/start times/health unchanged',equal(normalBefore,normalAfter));
 report.normal_services=normalAfter.map(s=>({name:s.name,running:s.running,health:s.health}));
 report.completed=true;report.finished_at=new Date().toISOString();
}catch(e){report.failure=report.checks.find(c=>!c.passed)?.check??'Rehearsal closure stopped safely; inspect private preservation state before retrying';process.exitCode=1;console.error(report.failure);}finally{
 fs.writeFileSync('docs/staff-administration/rehearsal-closure.json',JSON.stringify(report,null,2)+'\n');
 if(directory)fs.writeFileSync(path.join(directory,'closure.json'),JSON.stringify(report,null,2)+'\n');
}})();
