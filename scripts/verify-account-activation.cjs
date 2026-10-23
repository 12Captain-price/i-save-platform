// Read-only deployed checks; never signs in, requests recovery or changes records.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:64*1024*1024});
const report={checks:[],started_at:new Date().toISOString()};
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error(name);console.log('PASS: '+name);}
(async()=>{let browser;try{
 const activation=JSON.parse(fs.readFileSync('docs/staff-administration/activation.json','utf8'));
 check('backup/restore activation completed',activation.completed);
 const frozen=JSON.parse(fs.readFileSync(path.join(path.dirname(activation.backup.path),'after.json'),'utf8'));
 const live=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],require('./withdrawal-snapshot.cjs')));
 check('head0015 with unchanged post-migration rows/schema/sequences',live.revision==='0015_account_workflows'&&JSON.stringify(live)===JSON.stringify(frozen));
 const runtime=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],`
import json,sys,time
from pathlib import Path
from sqlalchemy.orm import Session
from app.database import engine
from app.migrations import require_current_schema
from app.services.business_settings import active
from app.services.withdrawals import policy_blockers,now
from app.services.invitation_delivery import get_invitation_mailer
assert engine.url.database=='isave' and engine.url.host=='db'
require_current_schema(engine)
with Session(engine) as db:
 print(json.dumps({'policy_blockers':len(policy_blockers(active(db)[1])),'real_clock':now.__module__=='app.security.auth' and abs(now().timestamp()-time.time())<2,'test_clock_loaded':'app.withdrawal_rehearsal' in sys.modules or Path('/tmp/withdrawal-test-clock.json').exists(),'delivery_mode':get_invitation_mailer().mode}))
`));
 check('withdrawal processing blocked; real clock and no rehearsal clock',runtime.policy_blockers>=7&&runtime.real_clock&&!runtime.test_clock_loaded);
 check('email adapter limited to local capture or explicitly unavailable',['mailpit','unavailable'].includes(runtime.delivery_mode));report.runtime=runtime;
 const frontend=JSON.parse(run(['inspect','i-saveprototype-main-frontend-1']))[0];
 const backend=JSON.parse(run(['inspect','i-saveprototype-main-backend-1']))[0];
 const worker=JSON.parse(run(['inspect','i-saveprototype-main-account-worker-1']))[0];
 const env=c=>Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 check('normal frontend/backend connection and worker database preserved',env(frontend).AUTH_API_ORIGIN==='http://backend:8000'&&env(worker).DATABASE_URL===env(backend).DATABASE_URL&&env(worker).APP_ENV!=='test'&&worker.State.Running);
 const labels=JSON.parse(run(['exec','i-saveprototype-main-frontend-1','node','-e',"const fs=require('fs'),path=require('path');function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]);}const code=files('/app/.output/server/_ssr').filter(p=>p.endsWith('.mjs')).map(p=>fs.readFileSync(p,'utf8')).join(' ');console.log(JSON.stringify(['Invite operational staff','Private-link delivery history','Recover your account','unread notifications'].every(x=>code.includes(x))));"]));
 check('deployed account/recovery/notification interface present',labels);
 for(let i=0;i<30;i++){
  const states=JSON.parse(run(['inspect','i-saveprototype-main-backend-1','i-saveprototype-main-frontend-1','i-saveprototype-main-db-1','i-saveprototype-main-mailpit-1']));
  if(states.every(c=>c.State.Running&&c.State.Health?.Status==='healthy')){report.services=states.map(c=>({name:c.Name.slice(1),health:'healthy'}));break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 check('normal application/PostgreSQL/Mailpit healthy',!!report.services);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({baseURL:'http://localhost:3000'});const page=await context.newPage();
 check('normal homepage HTTP200',(await page.goto('/'))?.status()===200);
 await page.goto('/recovery');check('normal public recovery form deployed',await page.getByRole('heading',{name:'Recover your account'}).isVisible());
 await page.goto('/portal/admin/staff');await page.waitForURL('**/login');check('anonymous staff portal denied',await page.getByLabel('Password',{exact:true}).isVisible());
 for(const endpoint of ['/api/admin/staff','/api/notifications','/api/admin/notification-deliveries'])check('anonymous API denied '+endpoint,(await context.request.get(endpoint)).status()===401);
 report.completed=true;report.finished_at=new Date().toISOString();
}catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Read-only deployed check stopped; no private request details emitted';process.exitCode=1;console.error(report.failure);}finally{await browser?.close();fs.writeFileSync('docs/staff-administration/post-deploy.json',JSON.stringify(report,null,2)+'\n');}})();
