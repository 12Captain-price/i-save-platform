// Local maintenance only. No dumps, credentials or database rows are printed.
// Run only after isolated validation. Recovery uses a separate networkless server.
const {execFileSync,spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const compose=['compose','-p','i-saveprototype-main','-f','compose.yaml','-f','compose.mailpit.yaml'];
const codes=['withdrawals:own','withdrawals:read','withdrawals:approve','withdrawals:process','withdrawals:verify'];
const expectedNew=['withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits'];
const restoreOnly=process.argv.includes('--restore-only');
const reportPath=restoreOnly?'docs/withdrawals/activation.json':'docs/withdrawals/activation-normal-0014.json';
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/, '').toLowerCase();
const recovery='isave-withdrawal-restore-'+stamp;
let directory,maintaining=false,migrated=false;
const report={started_at:new Date().toISOString(),checks:[],recovery_container:recovery,completed:false};
function run(args,options={}){return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024,...options});}
function check(name,condition){report.checks.push({check:name,passed:!!condition});if(!condition)throw Error(name);console.log('PASS: '+name);}
const preservedServices=['db','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1');
const serviceState=()=>preservedServices.map(n=>run(['inspect','--format','{{.Id}}|{{.State.StartedAt}}|{{.State.Running}}|{{.State.Health.Status}}',n]).trim());
const disabledPolicyPython=`
from sqlalchemy.orm import Session
from app.database import engine
from app.models.business_settings import BusinessSettingsVersion
from app.services.business_settings import active
from app.services.withdrawals import policy_blockers
import json
with Session(engine) as db:
 terms=active(db)[1]
 assert not any(v for k,v in terms.items() if k.startswith('withdrawal_'))
 assert len(policy_blockers(terms))>=7
 for version in db.query(BusinessSettingsVersion):
  assert not any(v for k,v in json.loads(version.snapshot).items() if k.startswith('withdrawal_'))
print('unset')
`;
const snapshotPython=require('./withdrawal-snapshot.cjs');

function normalSnapshot(){return JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],{input:snapshotPython}));}
function recoveryRun(code){return run(['run','--rm','--network','container:'+recovery,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_recovery_withdrawal','--entrypoint','python','i-saveprototype-main-backend','-c',code]);}
function sameOriginal(before,after,upgraded=false){
 for(const [name,value]of Object.entries(before.tables)){
  if(upgraded&&['permissions','role_permissions'].includes(name)){
   if(value.structure_sha256!==after.tables[name]?.structure_sha256)return false;
   continue;
  }
  if(JSON.stringify(value)!==JSON.stringify(after.tables[name]))return false;
 }
 for(const [name,value]of Object.entries(before.sequences)){
  if(upgraded&&name==='permissions_id_seq')continue;
  if(value!==after.sequences[name])return false;
 }
 return true;
}
function preservePermissionRows(before,after,executor){
 const code=`
from sqlalchemy import text
from app.database import engine
import json,hashlib
codes=${JSON.stringify(codes)}
result={}
with engine.connect() as c:
 c.execute(text('SET TRANSACTION READ ONLY'))
 for table in ['permissions','role_permissions']:
  rows=[r for r in c.execute(text('select row_to_json(t)::text from '+table+' t'))]
  keep=[]
  for (raw,) in rows:
   obj=json.loads(raw)
   code=obj.get('code') if table=='permissions' else c.execute(text('select code from permissions where id=:id'),{'id':obj['permission_id']}).scalar()
   if code not in codes:keep.append(raw)
  result[table]={'rows':len(keep),'sha256':hashlib.sha256('\\n'.join(sorted(keep)).encode()).hexdigest()}
 result['grants']=[list(r) for r in c.execute(text('select r.name,p.code from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id order by r.name,p.code')) if r[1] in codes]
print(json.dumps(result,sort_keys=True))`;
 return JSON.parse(executor(code));
}
(async()=>{
try{
 const preservedBefore=serviceState();
 if(!restoreOnly){
  const regression=JSON.parse(fs.readFileSync('docs/withdrawals/activation-regression.json','utf8'));
  check('current regression gates passed',regression.backend.exit_status===0&&regression.backend.failed===0&&regression.frontend.exit_status===0&&regression.frontend.failed===0&&regression.typescript.exit_status===0);
  report.regression=regression;
 }
 const oldBackend=JSON.parse(run(['inspect','i-saveprototype-main-backend-1']))[0];
 const oldFrontend=JSON.parse(run(['inspect','i-saveprototype-main-frontend-1']))[0];
 const dbEnv=Object.fromEntries(oldBackend.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 const uri=new URL(dbEnv.DATABASE_URL.replace('postgresql+psycopg:','postgresql:'));
 check('normal database target verified',uri.hostname==='db'&&uri.pathname==='/isave'&&!dbEnv.DOCUMENT_SCAN_TEST_ONLY?.match(/true|1/i));
 check('normal services exclude rehearsal environment and entrypoint',dbEnv.APP_ENV!=='test'&&!(oldBackend.Config.Cmd??[]).join(' ').includes('rehearsal')&&!Object.keys(dbEnv).some(k=>k.startsWith('WITHDRAWAL_REHEARSAL')));
 report.rollback={backend:oldBackend.Image,frontend:oldFrontend.Image};
 if(!restoreOnly){
 try{run(['image','tag',oldBackend.Image,'isave-backend-rollback:pre-withdrawal-20261023']);}
 catch{
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  const source=path.resolve('node_modules','.cache','isave-backend-rollback-'+stamp);
  fs.mkdirSync(source,{recursive:true});
  const archive=execFileSync('git',['archive','--format=tar','HEAD'],{encoding:null,maxBuffer:128*1024*1024,windowsHide:true});
  execFileSync('tar',['-xf','-','-C',source],{input:archive,stdio:['pipe','pipe','pipe'],windowsHide:true});
  run(['build','--label','isave.rollback.source='+commit,'-t','isave-backend-rollback:pre-withdrawal-20261023',path.join(source,'backend')]);
  report.rollback.backend_original=oldBackend.Image;
  report.rollback.backend=JSON.parse(run(['image','inspect','isave-backend-rollback:pre-withdrawal-20261023']))[0].Id;
  report.rollback.backend_source_commit=commit;
  check('pre-milestone backend retained from committed Git source',report.rollback.backend.startsWith('sha256:'));
 }
 try{run(['image','tag',oldFrontend.Image,'isave-frontend-rollback:pre-withdrawal-20261023']);}
 catch{
  // Docker Desktop may retain a running container after its manifest reference
  // is replaced. Snapshot only an unchanged, credential-free frontend filesystem.
  const allowed=new Set(['PATH','NODE_VERSION','YARN_VERSION','HOST','PORT','NODE_ENV','AUTH_API_ORIGIN']);
  check('frontend rollback environment contains only expected non-secret settings',oldFrontend.Config.Env.every(v=>allowed.has(v.slice(0,v.indexOf('=')))));
  check('frontend filesystem is unchanged from its build',run(['diff','i-saveprototype-main-frontend-1']).trim()==='');
  report.rollback.frontend_original=oldFrontend.Image;
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  report.rollback.frontend_source_commit=commit;
  let retained;
  try{retained=JSON.parse(run(['image','inspect','isave-frontend-rollback:pre-withdrawal-20261023']))[0];}catch{}
  if(retained?.Config?.Labels?.['isave.rollback.source']!==commit){
   const source=path.resolve('node_modules','.cache','isave-rollback-'+stamp);
   fs.mkdirSync(source,{recursive:true});
   const archive=execFileSync('git',['archive','--format=tar','HEAD'],{encoding:null,maxBuffer:128*1024*1024,windowsHide:true});
   execFileSync('tar',['-xf','-','-C',source],{input:archive,stdio:['pipe','pipe','pipe'],windowsHide:true});
   run(['build','--label','isave.rollback.source='+commit,'-t','isave-frontend-rollback:pre-withdrawal-20261023',source]);
   retained=JSON.parse(run(['image','inspect','isave-frontend-rollback:pre-withdrawal-20261023']))[0];
  }
  report.rollback.frontend=retained.Id;
  check('pre-milestone frontend retained from committed Git source',report.rollback.frontend.startsWith('sha256:'));
 }
 }
 directory=path.join(process.env.USERPROFILE,'isave-backups','withdrawal-'+stamp);
 fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 console.log('Private backup directory restricted to the current user and SYSTEM.');
 const before=normalSnapshot();check('normal database is at revision 0013',before.revision==='0013_recurring_reports');
 check('new permission catalog is absent before migration',!codes.some(c=>before.permissions.includes(c)));
 if(!restoreOnly){run([...compose,'stop','frontend','backend']);maintaining=true;}
 // The stopped old backend image remains available for read-only snapshots via a one-off container.
 const normalExec=(code)=>run(restoreOnly?['exec','i-saveprototype-main-backend-1','python','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]:[...compose,'run','--rm','--no-deps','--entrypoint','python','backend','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]);
 const frozen=JSON.parse(normalExec(snapshotPython));check(restoreOnly?'normal revision remains 0013 before read-only backup':'normal revision remains 0013 after quiescing writers',frozen.revision==='0013_recurring_reports');
 const permissionBefore=preservePermissionRows(null,null,normalExec);
 check('normal withdrawal policy unset before migration',normalExec(disabledPolicyPython).trim()==='unset');
 const dump=run(['exec','i-saveprototype-main-db-1','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'],{encoding:null});
 check('private custom-format dump created',dump.length>0&&dump.subarray(0,5).toString()==='PGDMP');
 const archive=path.join(directory,'pre-0014.dump');fs.writeFileSync(archive,dump);
 const digest=crypto.createHash('sha256').update(dump).digest('hex');
 check('saved Windows archive matches dump bytes',crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')===digest);
 report.backup={path:archive,sha256:digest,bytes:dump.length};
 fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(frozen,null,2));
 run(['run','-d','--name',recovery,'--network','none','-e','POSTGRES_DB=isave_recovery_withdrawal','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=volume,src='+recovery+'-data,dst=/var/lib/postgresql/data','postgres:16-alpine']);
 for(let n=0;n<30;n++){try{run(['exec',recovery,'pg_isready','-U','postgres','-d','isave_recovery_withdrawal']);break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
 run(['cp',archive,recovery+':/tmp/pre-0014.dump']);
 run(['exec',recovery,'pg_restore','-U','postgres','-d','isave_recovery_withdrawal','--no-owner','--exit-on-error','/tmp/pre-0014.dump']);
 const restored=JSON.parse(recoveryRun(snapshotPython));
 check('independent restore retains all original rows, structure and sequences',sameOriginal(frozen,restored)&&restored.revision===frozen.revision&&Object.keys(restored.tables).length===Object.keys(frozen.tables).length);
 recoveryRun('from app.migrations import upgrade,require_current_schema; from app.database import engine; upgrade(engine); require_current_schema(engine); print("Restore migration schema passed")');
 const rehearsed=JSON.parse(recoveryRun(snapshotPython));
 check('restored migration preserves original business records',sameOriginal(frozen,rehearsed,true)&&rehearsed.revision==='0014_withdrawals');
 const permRehearsed=preservePermissionRows(null,null,recoveryRun);
 check('restore migration preserves original permission rows and grants',JSON.stringify(permissionBefore.permissions)===JSON.stringify(permRehearsed.permissions)&&JSON.stringify(permissionBefore.role_permissions)===JSON.stringify(permRehearsed.role_permissions));
 check('only expected empty workflow tables added on restore',Object.keys(rehearsed.tables).filter(n=>!frozen.tables[n]).sort().join()===expectedNew.sort().join()&&expectedNew.every(n=>rehearsed.tables[n].rows===0));
 const validGrants=permRehearsed.grants.every(([role,code])=>role===(code==='withdrawals:own'?'member':'administrator'));
 check('new grants limited to canonical Member ownership and Admin office actions',validGrants&&permRehearsed.grants.length===5);
 check('restored withdrawal policy remains unset and blocks requests',recoveryRun(disabledPolicyPython).trim()==='unset');
 if(restoreOnly){
  const unchanged=normalSnapshot();
  check('restore-only rehearsal leaves all normal records and revision unchanged',sameOriginal(frozen,unchanged)&&unchanged.revision===frozen.revision);
  check('restored withdrawal policy remains unset',recoveryRun("from app.services.business_settings import active; from sqlalchemy.orm import Session; from app.database import engine; db=Session(engine); assert not any(v for k,v in active(db)[1].items() if k.startswith('withdrawal_')); print('unset')").trim()==='unset');
  report.completed=true;report.restore_migration='0014_withdrawals';report.normal_migration='0013_recurring_reports';report.normal_activation='Not applied: keep normal services/settings unchanged during rehearsal';report.finished_at=new Date().toISOString();
  console.log('PASS: private backup and independent restored migration verified; normal services and database unchanged.');
  return;
 }
 normalExec('from app.migrations import upgrade,require_current_schema; from app.database import engine; upgrade(engine); require_current_schema(engine); print("Normal migration schema passed")');migrated=true;
 const after=JSON.parse(normalExec(snapshotPython));
 check('normal revision is 0014',after.revision==='0014_withdrawals');
 check('normal migration preserves all original business rows and schema',sameOriginal(frozen,after,true));
 const permissionAfter=preservePermissionRows(null,null,normalExec);
 check('normal permission changes match rehearsed additive grants only',JSON.stringify(permissionAfter)===JSON.stringify(permRehearsed));
 check('no synthetic normal workflow records created',expectedNew.every(n=>after.tables[n].rows===0));
 check('normal withdrawal policy still blocks processing before restart',normalExec(disabledPolicyPython).trim()==='unset');
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after,null,2));
 run([...compose,'up','-d','--no-deps','--no-build','backend','frontend']);maintaining=false;
 check('normal withdrawal policy remains unset',normalExec("from app.services.business_settings import active; from sqlalchemy.orm import Session; db=Session(engine); assert not any(v for k,v in active(db)[1].items() if k.startswith('withdrawal_')); print('unset')").trim()==='unset');
 check('PostgreSQL and Mailpit IDs/start times/health preserved',JSON.stringify(preservedBefore)===JSON.stringify(serviceState()));
 report.completed=true;report.migration='0014_withdrawals';report.finished_at=new Date().toISOString();
 console.log('PASS: normal migration activated after independent restore rehearsal. Backup and recovery server retained privately.');
}catch(error){
 report.failure=error instanceof Error&&report.checks.some(c=>c.check===error.message)?'Preservation check failed':'Activation stopped; inspect private maintenance state before retrying. No credentials or database errors printed.';
 report.migrated=migrated;report.normal_writers_stopped=maintaining;
 console.error('Activation stopped safely. Normal writer state and completed checks are recorded; no automatic restore or data reset was attempted.');process.exitCode=1;
}finally{
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
})();
