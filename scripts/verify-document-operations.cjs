// Read-only deployed checks. A scanner RELOAD may refresh validated definitions;
// no file uploads, account sessions, policies or normal business records created.
const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const {chromium}=require('@playwright/test');const report={checks:[],completed:false};let browser;
const run=(a,input)=>execFileSync('docker',a,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:32000000});
const py=code=>run(['exec','-i','i-saveprototype-main-backend-1','python','-'],code);
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error('check');console.log('PASS: '+name);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 const activation=JSON.parse(fs.readFileSync('docs/private-document-operations/activation.json'));check('normal migration activation completed',activation.completed);
 let ready=false;for(let n=0;n<60;n++){try{ready=(await fetch('http://127.0.0.1:8000/ready')).ok;if(ready)break;}catch{}await sleep(1000);}check('normal API ready',ready);
 const current=JSON.parse(py('from app.database import engine\n'+require('./withdrawal-snapshot.cjs'))),saved=JSON.parse(fs.readFileSync(activation.private_preservation.directory+'/after.json'));
 check('deployed existing record/document/grant fingerprints still match maintenance result',JSON.stringify(current.tables)===JSON.stringify(saved.tables)&&JSON.stringify(current.sequences)===JSON.stringify(saved.sequences));
 check('normal head18 and operational tables empty',current.revision==='0018_operations'&&['operations_policies','operations_events','backup_jobs'].every(t=>current.tables[t].rows===0));
 const policy=JSON.parse(py(`import json
from sqlalchemy.orm import Session
from app.database import engine
from app.config import get_settings
from app.services.operations import active,preview
from app.services.withdrawals import policy_blockers
from app.services.business_settings import active as business
with Session(engine) as db:
 version,terms=active(db)
 print(json.dumps({'version':version,'all_unset':all(v is None for v in terms.values()),'deletion_disabled':not preview(db)['execution_available'],'synthetic_scanner_disabled':not get_settings().document_scan_test_only,'campaigns_disabled':not get_settings().campaign_delivery_enabled,'withdrawals_blocked':bool(policy_blockers(business(db)[1]))}))`));
 check('normal retention/schedule unset, erasure and synthetic adapter disabled; existing financial policy preserved',policy.version===0&&policy.all_unset&&policy.deletion_disabled&&policy.synthetic_scanner_disabled&&policy.campaigns_disabled&&policy.withdrawals_blocked);
 let scan;for(let n=0;n<40;n++){
  scan=JSON.parse(py("from app.services.scanner import status;import json;print(json.dumps(status()))"));if(scan.available)break;
  if(n%5===0)console.log('Waiting for current loaded scanner signatures; intake remains fail-closed.');
  if(n>1&&n%5===2){try{py("import socket\nwith socket.create_connection(('scanner',3310),timeout=5) as s:s.sendall(b'zRELOAD\\0');s.recv(1024)");}catch{}}
  await sleep(3000);
 }
 check('normal real scanner available with current signatures',scan?.available&&scan.mode==='clamav');
 const requirements=await(await fetch('http://localhost:3000/api/public/registration-requirements')).json();check('public intake reports real scanner availability without uploading normal documents',requirements.uploads_available&&requirements.scan_mode==='clamav');
 const services=JSON.parse(run(['inspect',...['db','backend','frontend','account-worker','mailpit','scanner','restore-db','operations-worker'].map(s=>'i-saveprototype-main-'+s+'-1')]));
 check('normal application/database/workers running; existing Mailpit stopped',services.every(c=>c.Name.endsWith('-mailpit-1')?!c.State.Running:c.State.Running));
 check('scanner and restore database have no published ports',services.filter(c=>['/i-saveprototype-main-scanner-1','/i-saveprototype-main-restore-db-1'].includes(c.Name)).every(c=>Object.keys(c.HostConfig.PortBindings||{}).length===0));
 const infrastructure=JSON.parse(run(['exec','i-saveprototype-main-operations-worker-1','python','-c',`import json
from sqlalchemy import create_engine,text
from app.database import engine
from app.config import get_settings
from app.services.backups import key
target=create_engine(get_settings().restore_test_url)
with engine.connect() as s,target.connect() as t:
 print(json.dumps({'key_available':len(key())==32,'independent_cluster':engine.url.host!=target.url.host and s.execute(text('select system_identifier from pg_control_system()')).scalar()!=t.execute(text('select system_identifier from pg_control_system()')).scalar()}))
target.dispose()`]));
 check('private worker key available and restore cluster independent',infrastructure.key_available&&infrastructure.independent_cluster);
 const denied=await fetch('http://localhost:3000/api/admin/operations');check('anonymous operational API denied',denied.status===401);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://localhost:3000/');check('normal public homepage renders without horizontal overflow',await page.getByRole('heading',{level:1}).count()===1&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto('http://localhost:3000/portal/admin/operations');await page.waitForURL('**/login');check('normal anonymous operations portal redirects to login',true);
 report.services=services.map(c=>({name:c.Name.slice(1),running:c.State.Running,health:c.State.Health?.Status||'not configured'}));report.normal_authenticated_uat_run=false;report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check||'Read-only deployed checkpoint failed; no private diagnostics emitted';console.error(report.failure);process.exitCode=1;}finally{if(browser)await browser.close();fs.writeFileSync('docs/private-document-operations/post-deploy.json',JSON.stringify(report,null,2)+'\n');}})();
