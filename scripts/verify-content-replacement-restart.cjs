// Controlled stop/start of the replacement ONLY. No down, volume removal or seed.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto');
const project='isave-content-replacement-20261025',database='isave_test_content_replacement_20261025';
const evidence='docs/content-support/replacement-20261025',compose=['compose','-p',project,'-f','compose.content-replacement.yaml'];
const report={project,database,checks:[],completed:false};
const run=(a,input)=>execFileSync('docker',a,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:64*1024*1024});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
const snapshot=()=>JSON.parse(run(['exec','-i',project+'-backend-1','python','-'],`import json,hashlib
from sqlalchemy import text
from app.database import engine
assert engine.url.database=='${database}' and engine.url.host=='db'
r={'tables':{}}
with engine.connect() as c:
 c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));c.execute(text("SET TIME ZONE 'UTC'"))
 r['database']=c.execute(text('select current_database()')).scalar()
 r['cluster']=str(c.execute(text('select system_identifier from pg_control_system()')).scalar())
 r['revision']=c.execute(text('select version_num from alembic_version')).scalar()
 for name in c.execute(text("select tablename from pg_tables where schemaname='public' order by tablename")).scalars():
  rows=sorted(c.execute(text('select row_to_json(t)::text from '+c.dialect.identifier_preparer.quote(name)+' t')).scalars())
  r['tables'][name]={'rows':len(rows),'sha256':hashlib.sha256('\\n'.join(rows).encode()).hexdigest()}
print(json.dumps(r,sort_keys=True))`));
const inspect=()=>JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit'].map(s=>project+'-'+s+'-1')]));
async function waitFor(url){for(let i=0;i<40;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).ok)return true;}catch{}await new Promise(r=>setTimeout(r,1000));}return false;}
async function inbox(){const r=await fetch('http://127.0.0.1:18025/api/v1/messages');if(!r.ok)throw Error('inbox unavailable');const d=await r.json();return {total:d.total,ids_sha256:crypto.createHash('sha256').update(d.messages.map(m=>m.ID).sort().join('|')).digest('hex')};}
(async()=>{try{
 const setup=JSON.parse(fs.readFileSync(evidence+'/setup.json','utf8'));check('minimum fixture and private setup capture completed',setup.completed);
 const before=snapshot(),mailBefore=await inbox(),containers=inspect();
 check('expected records present before restart',before.tables.users.rows===2&&before.tables.content_items.rows===1&&before.tables.content_versions.rows===2&&before.tables.support_tickets.rows===1&&before.tables.ticket_messages.rows===1&&mailBefore.total===2);
 const expectedVolume='isave-content-replacement-20261025-pg-7d9c2e1a';
 check('PostgreSQL durable volume mounted before restart',containers[0].Mounts.some(m=>m.Type==='volume'&&m.Name===expectedVolume));
 fs.writeFileSync(evidence+'/before-restart.json',JSON.stringify({database:before,inbox:mailBefore},null,2)+'\n');
 run([...compose,'stop','frontend','account-worker','backend','mailpit','db']);
 check('only replacement containers stopped',inspect().every(c=>!c.State.Running));
 run([...compose,'start','db','mailpit']);run([...compose,'start','backend']);
 check('backend ready after PostgreSQL restart',await waitFor('http://127.0.0.1:18070/ready'));
 run([...compose,'start','frontend','account-worker']);
 check('login and test inbox reachable after restart',await waitFor('http://127.0.0.1:13070/login')&&await waitFor('http://127.0.0.1:18025/'));
 const after=snapshot(),mailAfter=await inbox(),resumed=inspect();
 check('same PostgreSQL cluster and migration survived stop/start',before.cluster===after.cluster&&before.revision===after.revision&&after.revision==='0016_content_support');
 check('all database rows and histories match exactly',JSON.stringify(before.tables)===JSON.stringify(after.tables));
 check('same captured setup messages survived stop/start',JSON.stringify(mailBefore)===JSON.stringify(mailAfter));
 check('same containers and persistent volume reused',containers.every(c=>resumed.some(n=>n.Id===c.Id))&&resumed[0].Mounts.some(m=>m.Type==='volume'&&m.Name===expectedVolume));
 const publicData=await (await fetch('http://127.0.0.1:13070/api/public/content?kind=announcement')).json();
 check('only published version 1 public; private version 2 excluded',publicData.total===1&&publicData.items[0].version===1&&!JSON.stringify(publicData).includes('UNPUBLISHED'));
 check('anonymous protected APIs remain denied',(await fetch('http://127.0.0.1:13070/api/content')).status===401&&(await fetch('http://127.0.0.1:13070/api/support')).status===401);
 const financial=['savings_contributions','savings_ledger_entries','withdrawal_requests','withdrawal_payouts','subscription_fee_payments','application_registration_payments'];check('no financial fixtures or postings created',financial.every(t=>after.tables[t].rows===0));
 const preflight=JSON.parse(fs.readFileSync(evidence+'/preflight.json','utf8'));const normal=JSON.parse(run(['inspect',...preflight.normal_services.map(c=>c.name)]));check('normal containers, start times and running states unchanged',preflight.normal_services.every(c=>normal.some(n=>n.Id===c.id&&n.State.StartedAt===c.started_at&&n.State.Running===c.running)));
 fs.writeFileSync(evidence+'/after-restart.json',JSON.stringify({database:after,inbox:mailAfter},null,2)+'\n');report.persistent_volume=expectedVolume;report.mail_volume='isave-content-replacement-20261025-mail-7d9c2e1a';report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Restart verifier stopped safely; inspect replacement state, do not reseed';console.error(report.failure);process.exitCode=1;}finally{fs.writeFileSync(evidence+'/restart.json',JSON.stringify(report,null,2)+'\n');}})();
