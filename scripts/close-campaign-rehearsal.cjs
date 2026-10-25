// Private preservation; never emit mail bodies, session hashes or private links.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project='isave-campaigns-rehearsal-20261025',database='isave_test_campaigns_rehearsal';
const compose=['compose','-p',project,'-f','compose.campaigns-test.yaml'];
const report={checks:[],completed:false};
const run=(a,input,encoding='utf8')=>execFileSync('docker',a,{input,encoding,stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
const normal=()=>JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1')])).map(c=>({id:c.Id,running:c.State.Running,started:c.State.StartedAt}));
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
(async()=>{try{
 const before=normal();
 const result=JSON.parse(run(['exec',project+'-backend-1','python','-c',`import json
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import engine
from app.models.auth import AuthSession
from app.security.auth import validate_session
from app.exceptions import APIError
assert engine.url.database=='${database}' and engine.url.host=='db'
with Session(engine) as db:
 sessions=db.query(AuthSession).all()
 assert sessions and all(s.revoked_at for s in sessions), 'Unrevoked session remains'
 assert db.execute(text("select count(*) from audit_events where action='rehearsal_administrative_session_revocation'")).scalar()==1
 for s in sessions:
  try:validate_session(s)
  except APIError as e:assert e.status_code==401
  else:raise AssertionError('Revoked session accepted')
 assert db.execute(text('select count(*) from users')).scalar()==2
 assert db.execute(text('select enabled from marketing_preferences')).scalar() is False
 assert db.execute(text("select count(*) from marketing_consent_events where source='email_unsubscribe' and enabled=false")).scalar()==2
 assert db.execute(text("select count(*) from campaigns where id=3 and state='Complete'")).scalar()==1
 assert db.execute(text("select count(*) from campaign_recipients where campaign_id=3 and state='Mailpit accepted' and attempts=1")).scalar()==1
 assert db.execute(text('select count(*) from campaign_recipients where campaign_id=3')).scalar()==1
 assert db.execute(text("select count(*) from campaign_events where campaign_id=3 and action='queue'")).scalar()==1
 assert db.execute(text("select count(*) from campaign_events where campaign_id=3 and action='approve'")).scalar()==1
 assert db.execute(text('select count(*) from campaign_unsubscribe_links l join campaign_recipients r on r.id=l.recipient_id where r.campaign_id=3 and l.consumed_at is not null')).scalar()==1
 assert db.execute(text("select count(*) from campaign_recipients where campaign_id=2 and state='Suppressed'")).scalar()==1
 financial=['savings_contributions','savings_ledger_entries','withdrawal_requests','withdrawal_payouts','subscription_fee_payments','application_registration_payments']
 assert all(db.execute(text('select count(*) from '+t)).scalar()==0 for t in financial)
 print(json.dumps({'all_sessions_revoked':True,'session_validation_status':401,'member_session_cleanup':'administrative revocation; not manual logout','administrative_revocation_audit_events':1,'member_opted_in':False,'manual_campaign_recipients':1,'manual_campaign_attempts':1,'unsubscribe_consumed':True,'queued_suppression_preserved':True,'financial_records':0}))` ]));
 check('all rehearsal sessions revoked and server validation rejects401',result.all_sessions_revoked&&result.session_validation_status===401);
 check('single approved campaign attempt; consumed unsubscribe and suppression preserved',result.manual_campaign_recipients===1&&result.manual_campaign_attempts===1&&result.unsubscribe_consumed&&result.queued_suppression_preserved&&!result.member_opted_in);report.database_evidence=result;
 const list=await(await fetch('http://127.0.0.1:18025/api/v1/messages')).json();
 check('exactly one matching manual campaign captured in test Mailpit',list.messages.filter(m=>m.Subject==='[LOCAL TEST ONLY] TEST ONLY manual campaign').length===1);
 run([...compose,'stop','frontend','account-worker','backend','mailpit']);
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
 const dir=path.join(process.env.USERPROFILE,'isave-backups','campaign-rehearsal-final-'+stamp);fs.mkdirSync(dir,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();execFileSync('icacls',[dir,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 const dump=run(['exec',project+'-db-1','pg_dump','-U','postgres','-d',database,'-Fc','--no-owner'],undefined,null);
 fs.writeFileSync(path.join(dir,'rehearsal.dump'),dump);check('private PostgreSQL archive saved',dump.subarray(0,5).toString()==='PGDMP');
 run(['exec','-i',project+'-db-1','pg_restore','--no-owner','--file=/dev/null'],dump);
 const mail=run(['cp',project+'-mailpit-1:/data/.','-'],undefined,null);fs.writeFileSync(path.join(dir,'mailpit-data.tar'),mail);
 check('private stopped Mailpit archive saved',mail.length>1024);
 report.private_preservation={directory:dir,dump_sha256:crypto.createHash('sha256').update(dump).digest('hex'),mail_sha256:crypto.createHash('sha256').update(mail).digest('hex'),archive_decode_passed:true,independent_final_restore_run:false};
 run([...compose,'stop','db']);
 const containers=JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>project+'-'+s+'-1')]));
 check('only campaign rehearsal stopped with containers retained',containers.every(c=>c.Config.Labels['com.docker.compose.project']===project&&!c.State.Running));
 const volumes=[project+'-pg-8b4a1f3c',project+'-mail-8b4a1f3c'];
 check('dedicated persistent volumes retained',JSON.parse(run(['volume','inspect',...volumes])).length===2);report.retained_volumes=volumes;
 check('normal services unchanged',JSON.stringify(before)===JSON.stringify(normal()));
 report.browser_confirmations=['Operator viewed one eligible consenting recipient before queue','Operator approved and queued campaign3','Operator viewed one Mailpit acceptance','Operator received generic unsubscribe acknowledgement','Operator viewed zero current eligible recipients with historical acceptance retained','Operator reported Admin logout'];
 report.unconfirmed_manual=['Operator did not explicitly confirm opening the public announcement; exact public link passed automated browser checks'];
 report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check||'Safe closure checkpoint failed; no private request data emitted';console.error(report.failure);process.exitCode=1;}finally{fs.writeFileSync('docs/announcement-campaigns/closure.json',JSON.stringify(report,null,2)+'\n');}})();
