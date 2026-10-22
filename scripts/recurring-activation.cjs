// Local maintenance only. No dumps, credentials or database rows are printed.
// Run only after isolated validation. Recovery uses a separate networkless server.
const {execFileSync,spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const compose=['compose','-p','i-saveprototype-main','-f','compose.yaml','-f','compose.mailpit.yaml'];
const codes=['subscriptions:generate','reports:read','reports:export'];
const expectedNew=[];
const reportPath='docs/recurring-subscriptions/activation.json';
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/, '').toLowerCase();
const recovery='isave-recurring-restore-'+stamp;
let directory,maintaining=false,migrated=false;
const report={started_at:new Date().toISOString(),checks:[],recovery_container:recovery,completed:false};
function run(args,options={}){return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024,...options});}
function check(name,condition){report.checks.push({check:name,passed:!!condition});if(!condition)throw Error(name);console.log('PASS: '+name);}
const snapshotPython=`
from sqlalchemy import text
from app.database import engine
import json,hashlib
codes=${JSON.stringify(codes)}
result={'tables':{},'sequences':{}}
with engine.connect() as c:
 c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
 c.execute(text("SET TIME ZONE 'UTC'"))
 result['database']=c.execute(text('select current_database()')).scalar()
 result['revision']=c.execute(text('select version_num from alembic_version')).scalar()
 result['permissions']=list(c.execute(text('select code from permissions order by code')).scalars())
 for name in c.execute(text("select tablename from pg_tables where schemaname='public' order by tablename")).scalars():
  if name=='alembic_version':continue
  quoted=c.dialect.identifier_preparer.quote(name)
  rows=sorted(c.execute(text('select row_to_json(t)::text from '+quoted+' t')).scalars())
  columns=[list(r) for r in c.execute(text("select a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) from pg_attribute a join pg_class t on t.oid=a.attrelid join pg_namespace n on n.oid=t.relnamespace left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum where n.nspname='public' and t.relname=:name and a.attnum>0 and not a.attisdropped order by a.attnum"),{'name':name})]
  constraints=sorted(c.execute(text("select pg_get_constraintdef(con.oid) from pg_constraint con join pg_class t on t.oid=con.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname=:name"),{'name':name}).scalars())
  indexes=sorted(c.execute(text("select indexdef from pg_indexes where schemaname='public' and tablename=:name"),{'name':name}).scalars())
  result['tables'][name]={'rows':len(rows),'sha256':hashlib.sha256('\\n'.join(rows).encode()).hexdigest(),'structure_sha256':hashlib.sha256(json.dumps([columns,constraints,indexes],sort_keys=True).encode()).hexdigest()}
 for name,value in c.execute(text("select sequencename,last_value from pg_sequences where schemaname='public' order by sequencename")):
  result['sequences'][name]=value
print(json.dumps(result,sort_keys=True))
`;
function normalSnapshot(){return JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],{input:snapshotPython}));}
function recoveryRun(code){return run(['run','--rm','--network','container:'+recovery,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_recovery_recurring','--entrypoint','python','i-saveprototype-main-backend','-c',code]);}
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
 const oldBackend=JSON.parse(run(['inspect','i-saveprototype-main-backend-1']))[0];
 const oldFrontend=JSON.parse(run(['inspect','i-saveprototype-main-frontend-1']))[0];
 const dbEnv=Object.fromEntries(oldBackend.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 const uri=new URL(dbEnv.DATABASE_URL.replace('postgresql+psycopg:','postgresql:'));
 check('normal database target verified',uri.hostname==='db'&&uri.pathname==='/isave'&&!dbEnv.DOCUMENT_SCAN_TEST_ONLY?.match(/true|1/i));
 report.rollback={backend:oldBackend.Image,frontend:oldFrontend.Image};
 run(['image','tag',oldBackend.Image,'isave-backend-rollback:pre-recurring-20261022']);
 try{run(['image','tag',oldFrontend.Image,'isave-frontend-rollback:pre-recurring-20261022']);}
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
  try{retained=JSON.parse(run(['image','inspect','isave-frontend-rollback:pre-recurring-20261022']))[0];}catch{}
  if(retained?.Config?.Labels?.['isave.rollback.source']!==commit){
   const source=path.resolve('node_modules','.cache','isave-rollback-'+stamp);
   fs.mkdirSync(source,{recursive:true});
   const archive=execFileSync('git',['archive','--format=tar','HEAD'],{encoding:null,maxBuffer:128*1024*1024,windowsHide:true});
   execFileSync('tar',['-xf','-','-C',source],{input:archive,stdio:['pipe','pipe','pipe'],windowsHide:true});
   run(['build','--label','isave.rollback.source='+commit,'-t','isave-frontend-rollback:pre-recurring-20261022',source]);
   retained=JSON.parse(run(['image','inspect','isave-frontend-rollback:pre-recurring-20261022']))[0];
  }
  report.rollback.frontend=retained.Id;
  check('pre-milestone frontend retained from committed Git source',report.rollback.frontend.startsWith('sha256:'));
 }
 directory=path.join(process.env.USERPROFILE,'isave-backups','recurring-'+stamp);
 fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 console.log('Private backup directory restricted to the current user and SYSTEM.');
 const before=normalSnapshot();check('normal database is at revision 0012',before.revision==='0012_savings_ledger');
 check('new permission catalog is absent before migration',!codes.some(c=>before.permissions.includes(c)));
 run([...compose,'stop','frontend','backend']);maintaining=true;
 // The stopped old backend image remains available for read-only snapshots via a one-off container.
 const normalExec=(code)=>run([...compose,'run','--rm','--no-deps','--entrypoint','python','backend','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]);
 const frozen=JSON.parse(normalExec(snapshotPython));check('normal revision remains 0012 after quiescing writers',frozen.revision==='0012_savings_ledger');
 const permissionBefore=preservePermissionRows(null,null,normalExec);
 const dump=run(['exec','i-saveprototype-main-db-1','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'],{encoding:null});
 check('private custom-format dump created',dump.length>0&&dump.subarray(0,5).toString()==='PGDMP');
 const archive=path.join(directory,'pre-0013.dump');fs.writeFileSync(archive,dump);
 const digest=crypto.createHash('sha256').update(dump).digest('hex');
 check('saved Windows archive matches dump bytes',crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')===digest);
 report.backup={path:archive,sha256:digest,bytes:dump.length};
 fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(frozen,null,2));
 run(['run','-d','--name',recovery,'--network','none','-e','POSTGRES_DB=isave_recovery_recurring','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=volume,src='+recovery+'-data,dst=/var/lib/postgresql/data','postgres:16-alpine']);
 for(let n=0;n<30;n++){try{run(['exec',recovery,'pg_isready','-U','postgres','-d','isave_recovery_recurring']);break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
 run(['cp',archive,recovery+':/tmp/pre-0013.dump']);
 run(['exec',recovery,'pg_restore','-U','postgres','-d','isave_recovery_recurring','--no-owner','--exit-on-error','/tmp/pre-0013.dump']);
 const restored=JSON.parse(recoveryRun(snapshotPython));
 check('independent restore retains all original rows, structure and sequences',sameOriginal(frozen,restored)&&restored.revision===frozen.revision&&Object.keys(restored.tables).length===Object.keys(frozen.tables).length);
 recoveryRun('from app.migrations import upgrade,require_current_schema; from app.database import engine; upgrade(engine); require_current_schema(engine); print("Restore migration schema passed")');
 const rehearsed=JSON.parse(recoveryRun(snapshotPython));
 check('restored migration preserves original business records',sameOriginal(frozen,rehearsed,true)&&rehearsed.revision==='0013_recurring_reports');
 const permRehearsed=preservePermissionRows(null,null,recoveryRun);
 check('restore migration preserves original permission rows and grants',JSON.stringify(permissionBefore.permissions)===JSON.stringify(permRehearsed.permissions)&&JSON.stringify(permissionBefore.role_permissions)===JSON.stringify(permRehearsed.role_permissions));
 check('only expected empty workflow tables added on restore',Object.keys(rehearsed.tables).filter(n=>!frozen.tables[n]).sort().join()===expectedNew.sort().join()&&expectedNew.every(n=>rehearsed.tables[n].rows===0));
 const validGrants=permRehearsed.grants.every(([role,code])=>role==='administrator');
 check('new grants limited to canonical Admin',validGrants&&permRehearsed.grants.length===3);
 normalExec('from app.migrations import upgrade,require_current_schema; from app.database import engine; upgrade(engine); require_current_schema(engine); print("Normal migration schema passed")');migrated=true;
 const after=JSON.parse(normalExec(snapshotPython));
 check('normal revision is 0013',after.revision==='0013_recurring_reports');
 check('normal migration preserves all original business rows and schema',sameOriginal(frozen,after,true));
 const permissionAfter=preservePermissionRows(null,null,normalExec);
 check('normal permission changes match rehearsed additive grants only',JSON.stringify(permissionAfter)===JSON.stringify(permRehearsed));
 check('no synthetic normal workflow records created',expectedNew.every(n=>after.tables[n].rows===0));
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after,null,2));
 run([...compose,'up','-d','--no-deps','--no-build','backend','frontend']);maintaining=false;
 report.completed=true;report.migration='0013_recurring_reports';report.finished_at=new Date().toISOString();
 console.log('PASS: normal migration activated after independent restore rehearsal. Backup and recovery server retained privately.');
}catch(error){
 report.failure=error instanceof Error&&report.checks.some(c=>c.check===error.message)?'Preservation check failed':'Activation stopped; inspect private maintenance state before retrying. No credentials or database errors printed.';
 report.migrated=migrated;report.normal_writers_stopped=maintaining;
 console.error('Activation stopped safely. Normal writer state and completed checks are recorded; no automatic restore or data reset was attempted.');process.exitCode=1;
}finally{
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
})();
