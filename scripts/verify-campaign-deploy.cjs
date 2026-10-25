// Read-only normal deployment verification, never logs private account data.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const report={checks:[],completed:false};let browser;
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:128*1024*1024});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
(async()=>{try{
 const activation=JSON.parse(fs.readFileSync('docs/announcement-campaigns/activation.json','utf8'));check('private backup and independent restore activation completed',activation.completed);
 const frozen=JSON.parse(fs.readFileSync(path.join(path.dirname(activation.backup.path),'after.json'),'utf8'));
 const live=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],require('./withdrawal-snapshot.cjs')));
 check('normal head0017 and frozen post-migration rows/schema/sequences unchanged',live.revision==='0017_campaigns'&&JSON.stringify(live.tables)===JSON.stringify(frozen.tables)&&JSON.stringify(live.sequences)===JSON.stringify(frozen.sequences));
 const runtime=JSON.parse(run(['exec','-i','i-saveprototype-main-backend-1','python','-'],`import json,time,sys
from sqlalchemy.orm import Session
from app.database import engine
from app.migrations import require_current_schema
from app.config import get_settings
from app.services.business_settings import active
from app.services.withdrawals import policy_blockers,now
from app.services.evidence import test_scanner_allowed,scan_available
from app.services.invitation_delivery import get_invitation_mailer
assert engine.url.database=='isave' and engine.url.host=='db'
require_current_schema(engine)
with Session(engine) as db:
 print(json.dumps({'withdrawal_blockers':len(policy_blockers(active(db)[1])),'real_clock':abs(now().timestamp()-time.time())<2 and 'app.withdrawal_rehearsal' not in sys.modules,'test_scanner':test_scanner_allowed(),'scanner_available':scan_available(),'delivery':get_invitation_mailer().mode}))
`));check('withdrawals blocked and synthetic clock/scanner absent',runtime.withdrawal_blockers>=7&&runtime.real_clock&&!runtime.test_scanner);check('only local capture or unavailable email', ['mailpit','unavailable'].includes(runtime.delivery));report.runtime=runtime;
 const states=JSON.parse(run(['inspect',...['backend','frontend','account-worker','db','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1')]));
 check('normal app, database and worker running',states.slice(0,4).every(c=>c.State.Running)); const initial=JSON.parse(fs.readFileSync('docs/announcement-campaigns/isolation.json','utf8')).normal_services; check('normal Mailpit retains its original running/stopped state',states[4].State.Running===initial.find(c=>c.name==='/i-saveprototype-main-mailpit-1').running);report.services=states.map(c=>({name:c.Name.slice(1),running:c.State.Running,health:c.State.Health?.Status??'not configured'}));
 const env=c=>Object.fromEntries(c.Config.Env.map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));check('frontend/backend and worker database connections preserved',env(states[1]).AUTH_API_ORIGIN==='http://backend:8000'&&env(states[2]).DATABASE_URL===env(states[0]).DATABASE_URL);
 const deployed=run(['exec','i-saveprototype-main-frontend-1','node','-e',"const fs=require('fs'),p=require('path');function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(p.join(d,e.name)):[p.join(d,e.name)]);}let s=files('/app/.output/server').filter(f=>f.endsWith('.mjs')).map(f=>fs.readFileSync(f,'utf8')).join(' ');console.log(JSON.stringify(['Optional announcement and event emails','Saved-version preview','Record campaign action'].every(v=>s.includes(v))));"]);check('deployed editorial/support interface present',JSON.parse(deployed));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const context=await browser.newContext({baseURL:'http://localhost:3000'}),page=await context.newPage();
 for(const route of ['/','/about','/faqs','/team','/events','/announcements','/contact'])check('normal public page '+route,(await page.goto(route))?.status()===200);
 await page.goto('/portal/admin/campaigns');await page.waitForURL('**/login');check('anonymous campaign portal denied',await page.getByLabel('Password',{exact:true}).isVisible());
 for(const endpoint of ['/api/campaigns','/api/marketing/preferences'])check('anonymous protected API '+endpoint,(await context.request.get(endpoint)).status()===401);
 const disabled=run(['exec','i-saveprototype-main-backend-1','python','-c',"from app.config import get_settings; from app.services.campaigns import delivery_available; assert not get_settings().campaign_delivery_enabled and not delivery_available(); print('disabled')"]);check('normal campaign sending remains disabled',disabled.trim()==='disabled'); for(const table of ['marketing_preferences','marketing_consent_events','campaigns','campaign_versions','campaign_events','campaign_recipients','campaign_delivery_events','campaign_unsubscribe_links'])check('no normal consent/campaign/recipient rows '+table,live.tables[table].rows===0); check('public unsubscribe page is non-mutating and available',(await page.goto('/unsubscribe'))?.status()===200);
 await page.goto('/updates/999999/1');await page.getByRole('heading',{name:'Published version unavailable'}).waitFor();check('unavailable public version is clear with a single main landmark',(await page.getByRole('main').count())===1);
 check('normal readiness healthy',(await fetch('http://127.0.0.1:8000/ready')).status===200);report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Read-only deployed checkpoint stopped; no private data emitted';console.error(report.failure);process.exitCode=1;}finally{await browser?.close();fs.writeFileSync('docs/announcement-campaigns/post-deploy.json',JSON.stringify(report,null,2)+'\n');}})();
