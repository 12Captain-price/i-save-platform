// Persistent stop/start and final encrypted preservation. No normal mutations.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const project='isave-operations-rehearsal-20261025',dir=path.join(process.env.USERPROFILE,'isave-backups','operations-rehearsal-20261025');
const env={...process.env,OPERATIONS_TEST_KEY_FILE:path.join(dir,'backup.key')},compose=['compose','-p',project,'-f','compose.operations-test.yaml'];
const report={checks:[],completed:false};
const run=(a,input)=>execFileSync('docker',a,{env,input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:16000000});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error('check');console.log('PASS: '+name);}
const normal=()=>JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1')])).map(c=>({id:c.Id,running:c.State.Running,started:c.State.StartedAt}));
const snapshot=()=>JSON.parse(run(['exec',project+'-backend-1','python','-c',"from app.database import engine;assert engine.url.database=='isave_test_operations_rehearsal';\n"+require('./withdrawal-snapshot.cjs')]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 const n=normal();const before=snapshot();
 const sourceState=JSON.parse(run(['exec',project+'-backend-1','python','-c',`import json
from sqlalchemy import text
from app.database import engine
with engine.connect() as c:
 assert c.execute(text('select count(*) from auth_sessions where revoked_at is null')).scalar()==0
 assert c.execute(text("select count(*) from backup_jobs where state in ('Queued','Running')")).scalar()==0
 assert all(c.execute(text('select count(*) from '+t)).scalar()==0 for t in ['savings_contributions','savings_ledger_entries','application_registration_payments','subscription_fee_payments'])
 print(json.dumps({'all_sessions_revoked':True,'no_pending_jobs':True,'financial_records':0,'private_documents':c.execute(text('select count(*) from application_evidence')).scalar()}))`]));report.final_database_evidence=sourceState;
 check('sessions revoked; no pending work or financial fixtures',sourceState.all_sessions_revoked&&sourceState.no_pending_jobs&&sourceState.financial_records===0);
 run([...compose,'stop','frontend','operations-worker','backend','scanner','restore-db','db']);
 run([...compose,'start','db','restore-db','scanner','backend','frontend','operations-worker']);
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch('http://127.0.0.1:18090/ready')).ok;if(ready)break;}catch{}await sleep(1000);}
 check('isolated application ready after controlled persistent restart',ready);
 const after=snapshot();check('all records, document bytes, policies and job history survived restart',JSON.stringify(before)===JSON.stringify(after));
 const preserved=JSON.parse(run(['exec',project+'-operations-worker-1','python','-c',"from app.services.backups import create_backup;import json;checksum,size=create_backup(9999);print(json.dumps({'sha256':checksum,'bytes':size}))"]));
 const file=path.join(dir,'rehearsal-final.isave');run(['cp',project+'-operations-worker-1:/var/lib/isave-backups/backup-9999.isave',file]);
 check('final encrypted archive privately preserved',fs.statSync(file).size===preserved.bytes);report.private_preservation={file,...preserved,independent_final_restore_run:false};
 run([...compose,'stop','frontend','operations-worker','backend','scanner','restore-db','db']);
 const services=JSON.parse(run(['inspect',...['db','restore-db','scanner','backend','frontend','operations-worker'].map(s=>project+'-'+s+'-1')]));
 check('only operations rehearsal stopped; all containers retained',services.every(c=>c.Config.Labels['com.docker.compose.project']===project&&!c.State.Running));
 const volumes=['pg','restore','backups','signatures'].map(v=>project+'-'+v+'-64f09ab2');check('all four dedicated volumes retained',JSON.parse(run(['volume','inspect',...volumes])).length===4);report.retained_volumes=volumes;
 check('normal service identities/start times/states unchanged',JSON.stringify(n)===JSON.stringify(normal()));report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check||'Private preservation checkpoint failed safely';process.exitCode=1;console.error(report.failure);}finally{fs.writeFileSync('docs/private-document-operations/persistence.json',JSON.stringify(report,null,2)+'\n');}})();
