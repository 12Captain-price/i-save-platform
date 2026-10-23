// Private local maintenance. Dumps/DB rows/credentials never enter output.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const snapshot=require('./withdrawal-snapshot.cjs');
const compose=['compose','-p','i-saveprototype-main','-f','compose.yaml','-f','compose.mailpit.yaml'];
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
const recovery='isave-accounts-restore-'+stamp;
const evidence='docs/staff-administration/activation.json';
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
const report={started_at:new Date().toISOString(),checks:[],completed:false,recovery};
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
function same(before,after){return Object.entries(before.tables).every(([k,v])=>JSON.stringify(v)===JSON.stringify(after.tables[k]))&&Object.entries(before.sequences).every(([k,v])=>v===after.sequences[k]);}
const services=['db','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1');
const state=()=>services.map(n=>run(['inspect','--format','{{.Id}}|{{.State.StartedAt}}|{{.State.Running}}',n]).trim());
let stopped=false;
(async()=>{try{
 const regression=JSON.parse(fs.readFileSync('docs/staff-administration/validation.json','utf8'));
 check('regression gates passed',regression.backend.failed===0&&regression.backend.exit_status===0&&regression.final_security.failed===0&&regression.final_security.exit_status===0&&regression.frontend.failed===0&&regression.browser.failed===0&&regression.typescript.exit_status===0);
 const preserved=state();
 const old=JSON.parse(run(['inspect','i-saveprototype-main-backend-1','i-saveprototype-main-frontend-1']));
 check('normal target and real runtime configuration',old[0].Config.Env.some(v=>v.startsWith('DATABASE_URL=')&&new URL(v.slice(13).replace('postgresql+psycopg:','postgresql:')).pathname==='/isave')&&!old[0].Config.Env.includes('APP_ENV=test')&&!old[0].Config.Env.includes('DOCUMENT_SCAN_TEST_ONLY=true'));
 run(['image','tag',old[0].Image,'isave-backend-rollback:pre-accounts-20261023']);
 run(['image','tag',old[1].Image,'isave-frontend-rollback:pre-accounts-20261023']);
 report.rollback=old.map(c=>({name:c.Name,image:c.Image}));
 run([...compose,'build','backend','frontend','account-worker']);
 const directory=path.join(process.env.USERPROFILE,'isave-backups','accounts-'+stamp);fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 run([...compose,'stop','frontend','backend']);stopped=true;
 const normal=(code)=>run([...compose,'run','--rm','--no-deps','--entrypoint','python','backend','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]);
 const before=JSON.parse(normal(snapshot));check('normal head0014 before migration',before.revision==='0014_withdrawals');
 const dump=execFileSync('docker',['exec','i-saveprototype-main-db-1','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'],{stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
 const file=path.join(directory,'pre-0015.dump');fs.writeFileSync(file,dump);
 check('private backup valid and saved exactly',dump.subarray(0,5).toString()==='PGDMP'&&dump.equals(fs.readFileSync(file)));
 report.backup={path:file,bytes:dump.length,sha256:crypto.createHash('sha256').update(dump).digest('hex')};fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(before));
 run(['run','-d','--name',recovery,'--network','none','-e','POSTGRES_DB=isave_recovery_accounts','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=volume,src='+recovery+'-data,dst=/var/lib/postgresql/data','postgres:16-alpine']);
 for(let i=0;i<30;i++){try{run(['exec',recovery,'pg_isready','-U','postgres','-d','isave_recovery_accounts']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 run(['cp',file,recovery+':/tmp/pre-0015.dump']);run(['exec',recovery,'pg_restore','-U','postgres','-d','isave_recovery_accounts','--no-owner','--exit-on-error','/tmp/pre-0015.dump']);
 const recover=(code)=>run(['run','--rm','--network','container:'+recovery,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_recovery_accounts','--entrypoint','python','i-saveprototype-main-backend','-c',code]);
 check('independent restore preserves original rows/schema/sequences',same(before,JSON.parse(recover(snapshot))));
 const upgrade="from app.database import engine; from app.migrations import upgrade,require_current_schema; upgrade(engine);require_current_schema(engine)";
 recover(upgrade);const rehearsed=JSON.parse(recover(snapshot));
 check('restored upgrade retains every original row/grant/sequence',same(before,rehearsed)&&rehearsed.revision==='0015_account_workflows');
 const tables=['account_links','notifications','recovery_requests'];
 check('only three empty workflow tables added',Object.keys(rehearsed.tables).filter(k=>!before.tables[k]).sort().join()===tables.sort().join()&&tables.every(k=>rehearsed.tables[k].rows===0));
 normal(upgrade);const after=JSON.parse(normal(snapshot));
 check('normal head0015 and original records/grants preserved',after.revision==='0015_account_workflows'&&same(before,after));
 check('no test accounts, invitations or notifications copied',tables.every(k=>after.tables[k].rows===0));
 const policy="from sqlalchemy.orm import Session; from app.services.business_settings import active; from app.services.withdrawals import policy_blockers; db=Session(engine); assert len(policy_blockers(active(db)[1]))>=7; import sys; assert 'app.withdrawal_rehearsal' not in sys.modules; print('blocked')";
 check('normal withdrawal policies remain blocked',normal(policy).trim()==='blocked');
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after));
 run([...compose,'up','-d','--no-deps','--no-build','backend','frontend','account-worker']);stopped=false;
 check('PostgreSQL and Mailpit not recreated/restarted',JSON.stringify(preserved)===JSON.stringify(state()));
 report.completed=true;report.migration='0015_account_workflows';report.finished_at=new Date().toISOString();
 run(['stop',recovery]);
}catch(e){report.failure=report.checks.find(x=>!x.passed)?.check??'Private maintenance stopped safely; inspect state before retrying';report.writers_stopped=stopped;process.exitCode=1;console.error(report.failure);}finally{fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');}})();
