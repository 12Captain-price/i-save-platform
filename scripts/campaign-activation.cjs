// Private local upgrade. Never print rows, credentials, mail bodies or headers.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const compose=['compose','-p','i-saveprototype-main','-f','compose.yaml','-f','compose.mailpit.yaml'];
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase(),restore='isave-campaign-restore-'+stamp;
const codes=['campaigns:read','campaigns:prepare','campaigns:approve','campaigns:send','campaigns:recipients','marketing:own'];
const added=['marketing_preferences','marketing_consent_events','campaigns','campaign_versions','campaign_events','campaign_recipients','campaign_delivery_events','campaign_unsubscribe_links'];
const snapshot=require('./withdrawal-snapshot.cjs').replace('print(json.dumps(result,sort_keys=True))',`with engine.connect() as c:
 result['catalog']=[list(r) for r in c.execute(text('select id,code from permissions order by id'))]
 result['grants']=[list(r) for r in c.execute(text('select role_id,permission_id from role_permissions order by role_id,permission_id'))]
 result['roles']=[list(r) for r in c.execute(text('select id,name from roles order by id'))]
print(json.dumps(result,sort_keys=True))`);
const report={checks:[],completed:false,started_at:new Date().toISOString()};let stopped=false;
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function retained(a,b){return Object.entries(a.tables).every(([t,v])=>['permissions','role_permissions'].includes(t)?v.structure_sha256===b.tables[t]?.structure_sha256:equal(v,b.tables[t]))&&Object.entries(a.sequences).every(([s,v])=>s==='permissions_id_seq'||v===b.sequences[s])&&a.catalog.every(r=>b.catalog.some(n=>equal(r,n)))&&a.grants.every(r=>b.grants.some(n=>equal(r,n)))&&b.catalog.filter(r=>!a.catalog.some(n=>n[0]===r[0])).every(r=>codes.includes(r[1]))&&b.grants.filter(r=>!a.grants.some(n=>equal(n,r))).every(r=>{const code=b.catalog.find(c=>c[0]===r[1])?.[1],role=b.roles.find(n=>n[0]===r[0])?.[1];return codes.includes(code)&&role===(code==='marketing:own'?'member':'administrator');});}
const stable=()=>JSON.parse(run(['inspect','i-saveprototype-main-db-1','i-saveprototype-main-mailpit-1'])).map(c=>({id:c.Id,started:c.State.StartedAt,running:c.State.Running}));
(async()=>{try{
 const tests=JSON.parse(fs.readFileSync('docs/announcement-campaigns/validation.json','utf8'));
 check('all regression/build/browser/persistence gates passed',tests.backend.exit_status===0&&tests.backend.failed===0&&tests.final_backend.exit_status===0&&tests.frontend.failed===0&&tests.frontend.exit_status===0&&tests.browser.failed===0&&tests.browser.completed&&tests.persistence.completed&&tests.typescript.exit_status===0&&tests.build.exit_status===0);
 const preserved=stable(),old=JSON.parse(run(['inspect','i-saveprototype-main-backend-1','i-saveprototype-main-frontend-1']));
 const environment=Object.fromEntries(old[0].Config.Env.map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
 check('normal target and real configuration',new URL(environment.DATABASE_URL.replace('postgresql+psycopg:','postgresql:')).pathname==='/isave'&&environment.APP_ENV!=='test'&&environment.DOCUMENT_SCAN_TEST_ONLY!=='true');
 old.forEach((c,i)=>run(['image','tag',c.Image,'isave-'+(i?'frontend':'backend')+'-rollback:pre-campaigns-'+stamp]));report.rollback=old.map(c=>({name:c.Name,image:c.Image}));
 run([...compose,'build','backend','frontend','account-worker']);
 const directory=path.join(process.env.USERPROFILE,'isave-backups','campaigns-'+stamp);fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 run([...compose,'stop','frontend','account-worker','backend']);stopped=true;
 const normal=code=>run([...compose,'run','--rm','--no-deps','--entrypoint','python','backend','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]);
 const before=JSON.parse(normal(snapshot));check('normal starts at head0016',before.revision==='0016_content_support');
 const dump=execFileSync('docker',['exec','i-saveprototype-main-db-1','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'],{stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
 const file=path.join(directory,'pre-0017.dump');fs.writeFileSync(file,dump);check('private backup saved byte-for-byte',dump.subarray(0,5).toString()==='PGDMP'&&dump.equals(fs.readFileSync(file)));report.backup={path:file,bytes:dump.length,sha256:crypto.createHash('sha256').update(dump).digest('hex')};fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(before));
 run(['run','-d','--name',restore,'--network','none','-e','POSTGRES_DB=isave_recovery_campaigns','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=volume,src='+restore+'-data,dst=/var/lib/postgresql/data','postgres:16-alpine']);
 for(let i=0;i<30;i++){try{run(['exec',restore,'pg_isready','-U','postgres','-d','isave_recovery_campaigns']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 run(['cp',file,restore+':/tmp/restore.dump']);run(['exec',restore,'pg_restore','-U','postgres','-d','isave_recovery_campaigns','--no-owner','--exit-on-error','/tmp/restore.dump']);
 const recover=code=>run(['run','--rm','--network','container:'+restore,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_recovery_campaigns','--entrypoint','python','i-saveprototype-main-backend','-c',code]);
 const restored=JSON.parse(recover(snapshot));check('independent restore matches original tables/grants/sequences',equal(before.tables,restored.tables)&&equal(before.sequences,restored.sequences)&&equal(before.catalog,restored.catalog)&&equal(before.grants,restored.grants));
 const upgrade='from app.database import engine; from app.migrations import upgrade,require_current_schema; upgrade(engine);require_current_schema(engine)';recover(upgrade);const rehearsed=JSON.parse(recover(snapshot));
 check('restored migration retains all original records and grants',rehearsed.revision==='0017_campaigns'&&retained(before,rehearsed));
 check('exactly eight empty campaign/consent tables added',equal(Object.keys(rehearsed.tables).filter(k=>!before.tables[k]).sort(),[...added].sort())&&added.every(t=>rehearsed.tables[t].rows===0));
 normal(upgrade);const after=JSON.parse(normal(snapshot));check('normal head0017 with original records and grants preserved',after.revision==='0017_campaigns'&&retained(before,after));check('no consent imported, campaigns or recipient jobs copied',added.every(t=>after.tables[t].rows===0));
 check('normal campaign delivery remains explicitly disabled',normal("from app.config import get_settings; from app.services.campaigns import delivery_available; assert not get_settings().campaign_delivery_enabled and not delivery_available(); print('disabled')").trim()==='disabled');
 const policy="from sqlalchemy.orm import Session; from app.services.business_settings import active; from app.services.withdrawals import policy_blockers; import sys; db=Session(engine); assert len(policy_blockers(active(db)[1]))>=7 and 'app.withdrawal_rehearsal' not in sys.modules; print('blocked')";check('normal withdrawal policy remains disabled',normal(policy).trim()==='blocked');
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after));run([...compose,'up','-d','--no-deps','--no-build','backend','frontend','account-worker']);stopped=false;check('normal PostgreSQL and Mailpit not restarted',equal(preserved,stable()));run(['stop',restore]);report.migration='0017_campaigns';report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Private maintenance checkpoint failed; inspect state before retrying';report.writers_stopped=stopped;process.exitCode=1;console.error(report.failure);}finally{fs.mkdirSync('docs/announcement-campaigns',{recursive:true});fs.writeFileSync('docs/announcement-campaigns/activation.json',JSON.stringify(report,null,2)+'\n');}})();
