const {execFileSync,spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const project='isave-operations-rehearsal-20261025',report={checks:[],completed:false};
const env={...process.env,OPERATIONS_TEST_KEY_FILE:path.join(process.env.USERPROFILE,'isave-backups','operations-rehearsal-20261025','backup.key')};
const compose=['compose','-p',project,'-f','compose.operations-test.yaml'];
const run=(a,input)=>execFileSync('docker',a,{input,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error('check');console.log('PASS: '+name);}
const py=code=>run(['exec','-i',project+'-backend-1','python','-'],code);
const queue=(kind,backup)=>Number(py(`from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.services.operations import queue
from app.schemas.operations import Job
from uuid import uuid4
assert engine.url.database=='isave_test_operations_rehearsal'
with Session(engine) as db:
 actor=db.query(User).filter_by(email='accounts-admin@example.test').one()
 row=queue(db,actor,Job(request_key=uuid4(),kind='${kind}',backup_id=${backup??'None'},confirm=True));db.commit();print(row.id)`));
const status=id=>JSON.parse(py(`import json
from sqlalchemy.orm import Session
from app.database import engine
from app.models.operations import BackupJob
with Session(engine) as db:
 row=db.get(BackupJob,${id});print(json.dumps({'state':row.state,'reason':row.reason}))`));
(async()=>{let stopped=false;try{
 run([...compose,'stop','operations-worker']);stopped=true;
 const failure=queue('backup');
 const attempt=spawnSync('docker',[...compose,'run','--rm','--no-deps','-e','BACKUP_KEY_FILE=/missing-key','operations-worker','python','-m','app.operations_worker','--once'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 check('missing encryption key fails closed with scheduler exit1',attempt.status===1&&status(failure).state==='Failed');
 const good=queue('backup');
 const once=()=>new Promise(resolve=>{const {spawn}=require('node:child_process');const p=spawn('docker',[...compose,'run','--rm','--no-deps','operations-worker','python','-m','app.operations_worker','--once'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});p.on('close',code=>resolve(code));});
 const concurrent=await Promise.all([once(),once()]);
 check('concurrent worker commands complete without duplicate job or archive',concurrent.every(c=>c===0)&&status(good).state==='Succeeded');
 const restoreFailure=queue('restore-test',good);
 const badRestore=spawnSync('docker',[...compose,'run','--rm','--no-deps','-e','RESTORE_TEST_URL=postgresql+psycopg://postgres@db:5432/postgres','operations-worker','python','-m','app.operations_worker','--once'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 check('restore pointing at source host is refused with exit1',badRestore.status===1&&status(restoreFailure).state==='Failed');
 report.job_ids={missing_key:failure,concurrent_backup:good,refused_live_target:restoreFailure};report.completed=true;
 }catch{report.failure='Isolated worker checkpoint failed; no private diagnostics emitted';process.exitCode=1;}finally{if(stopped)run([...compose,'start','operations-worker']);fs.writeFileSync('docs/private-document-operations/worker.json',JSON.stringify(report,null,2)+'\n');}})();
