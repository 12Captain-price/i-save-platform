// Read-only post-activation checks. No account/session or financial writes.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const snapshot=require('./withdrawal-snapshot.cjs');
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:64*1024*1024});
const result={started_at:new Date().toISOString(),checks:[]};
function check(name,value){result.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
(async()=>{let browser;try{
 const activation=JSON.parse(fs.readFileSync('docs/withdrawals/activation-normal-0014.json','utf8'));
 check('activation preservation gate completed',activation.completed&&activation.migration==='0014_withdrawals');
 const frozen=JSON.parse(fs.readFileSync(path.join(path.dirname(activation.backup.path),'after.json'),'utf8'));
 const live=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],"from app.database import engine; assert engine.url.host=='db' and engine.url.database=='isave'\n"+snapshot));
 check('deployed migration head0014 and all post-migration rows/schema/sequences unchanged',live.revision==='0014_withdrawals'&&JSON.stringify(live)===JSON.stringify(frozen));
 const runtime=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],`
import os,sys,json,time
from pathlib import Path
from sqlalchemy.orm import Session
from app.database import engine
assert engine.url.database=='isave' and engine.url.host=='db'
from app.main import app
from app.migrations import require_current_schema
from app.services.business_settings import active
from app.services import withdrawals
require_current_schema(engine)
with Session(engine) as db:
 terms=active(db)[1]
 print(json.dumps({'policy_unset':not any(v for k,v in terms.items() if k.startswith('withdrawal_')),'missing_decisions':len(withdrawals.policy_blockers(terms)),'normal_clock_function':withdrawals.now.__module__=='app.security.auth','real_time_clock':abs(withdrawals.now().timestamp()-time.time())<2,'rehearsal_module_loaded':'app.withdrawal_rehearsal' in sys.modules,'test_clock_file_present':Path('/tmp/withdrawal-test-clock.json').exists(),'test_environment':os.environ.get('APP_ENV','').lower()=='test','test_scanner':os.environ.get('DOCUMENT_SCAN_TEST_ONLY','').lower() in ['true','1']}))
`));
 check('normal policy remains unset with mandatory processing blockers',runtime.policy_unset&&runtime.missing_decisions>=7);
 check('normal uses real clock without rehearsal/scanner configuration or clock file',runtime.normal_clock_function&&runtime.real_time_clock&&!runtime.rehearsal_module_loaded&&!runtime.test_clock_file_present&&!runtime.test_environment&&!runtime.test_scanner);
 result.runtime=runtime;
 const deployed=JSON.parse(run(['inspect','i-saveprototype-main-frontend-1','i-saveprototype-main-backend-1']));
 const built=JSON.parse(run(['image','inspect','i-saveprototype-main-frontend','i-saveprototype-main-backend']));
 check('only current built backend/frontend images deployed',deployed.every((c,i)=>c.Image===built[i].Id));
 const probe=JSON.parse(run(['inspect','isave-withdrawal-activation-ui-check']))[0];
 check('deployed readable interface matches browser-tested production image',deployed[0].Image===probe.Image&&deployed[0].Config.Env.includes('AUTH_API_ORIGIN=http://backend:8000'));
 const assets=JSON.parse(run(['exec','i-saveprototype-main-frontend-1','node','-e',`
const fs=require('fs'),path=require('path');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const code=files('/app/.output/server/_ssr').filter(p=>p.endsWith('.mjs')).map(p=>fs.readFileSync(p,'utf8')).join(' ');
const labels=['Withdrawal policy decisions','Full or partial amounts','Processor and verifier distinct','Decision not approved','Payout verification time:','Audit recorded','Accepted request acknowledgement'];
console.log(JSON.stringify({readable_labels:labels.every(x=>code.includes(x))}));
`]));
 check('deployed server assets contain readable policy/acknowledgement/audit summaries',assets.readable_labels);
 const connection=JSON.parse(run(['exec','i-saveprototype-main-frontend-1','node','-e',`
(async()=>{const origin=process.env.AUTH_API_ORIGIN;const paths=['/ready','/api/v1/auth/me','/api/v1/withdrawals'];const statuses=[];for(const p of paths)statuses.push((await fetch(new URL(p,origin),{redirect:'error'})).status);console.log(JSON.stringify(statuses));})().catch(()=>process.exit(1));
`]));
 check('normal frontend reaches its backend; anonymous backend auth/withdrawals denied',JSON.stringify(connection)===JSON.stringify([200,401,401]));
 for(let i=0;i<30;i++){
  const health=JSON.parse(run(['inspect','i-saveprototype-main-frontend-1','i-saveprototype-main-backend-1','i-saveprototype-main-db-1','i-saveprototype-main-mailpit-1']));
  if(health.every(c=>c.State.Running&&c.State.Health?.Status==='healthy')){result.health=health.map(c=>({service:c.Name.slice(1),status:'healthy'}));break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 check('normal frontend/backend/PostgreSQL/Mailpit healthy',!!result.health);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({baseURL:'http://localhost:3000'});const page=await context.newPage();
 const home=await page.goto('/');check('public homepage smoke HTTP200',home?.status()===200);
 for(const route of ['/portal/member/withdrawals','/portal/admin/withdrawals']){
  await page.goto(route);await page.waitForURL('**/login');
  check('anonymous protected route denied: '+route,await page.getByLabel('Password',{exact:true}).isVisible());
 }
 check('anonymous withdrawal API denied401',(await context.request.get('/api/withdrawals')).status()===401);
 check('anonymous identity API denied401',(await context.request.get('/api/auth/me')).status()===401);
 result.completed=true;result.finished_at=new Date().toISOString();
}catch{
 result.failure='Post-activation read-only verification stopped; inspect safe checks before changing anything.';process.exitCode=1;console.error(result.failure);
}finally{await browser?.close();fs.writeFileSync('docs/withdrawals/activation-post-check.json',JSON.stringify(result,null,2)+'\n');}})();
