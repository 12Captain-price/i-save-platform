// Real browser/API/PostgreSQL/Mailpit checks. Never print private links or raw errors.
const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
const project='isave-campaigns-rehearsal-20261025',origin='http://127.0.0.1:13080',database='isave_test_campaigns_rehearsal';
const report={checks:[],passed:0,failed:0};let stage='fixture',browser,privateTokens=[];
const py=code=>execFileSync('docker',['exec','-i',project+'-backend-1','python','-'],{input:code,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});
function check(name,v){if(!v)throw Error('Checkpoint failed');report.checks.push({check:name,passed:true});report.passed++;console.log('PASS: '+name);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function mail(){const r=await fetch('http://127.0.0.1:18025/api/v1/messages');if(!r.ok)throw Error('Inbox unavailable');return r.json();}
async function waitFor(fn,seconds=40){for(let i=0;i<seconds;i++){const r=await fn();if(r)return r;await sleep(1000);}throw Error('Timed checkpoint');}
async function saveDraft(page,subject,schedule=''){
 await page.getByRole('button',{name:'New campaign draft'}).click();await page.getByLabel('Effective published announcement or event').selectOption({index:1});await page.getByLabel('Email subject',{exact:true}).fill(subject);await page.getByLabel('Campaign message').fill('TEST ONLY synthetic optional email. No normal records or external delivery.');if(schedule)await page.getByLabel('Optional scheduled time').fill(schedule);
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/campaigns'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save campaign draft'}).click();const r=await response;if(!r.ok())throw Error('Draft rejected');const c=await r.json();await page.getByRole('heading',{name:'Campaign '+c.id+' · Draft',exact:true}).waitFor();return c;
}
async function preview(page){const response=page.waitForResponse(r=>r.url().includes('/preview')&&r.request().method()==='GET');await page.getByRole('button',{name:'Load saved publication and audience preview'}).click();const r=await response;if(!r.ok())throw Error('Preview rejected');const p=await r.json();await page.getByText('Currently eligible recipients: '+p.eligible_count,{exact:true}).waitFor();return p;}
async function action(page,value){await page.getByLabel('Explicit campaign action').selectOption(value);await page.getByLabel('Reason for action').fill('TEST ONLY browser explicit '+value);if(value==='queue')await page.getByRole('checkbox').check();const response=page.waitForResponse(r=>r.url().endsWith('/decision')&&r.request().method()==='POST');await page.getByRole('button',{name:'Record campaign action'}).click();const r=await response;if(!r.ok())throw Error('Action rejected');const c=await r.json();if(value==='queue')await page.getByText('Campaign queued. Queueing is not evidence of delivery.').waitFor();else await page.getByRole('heading',{name:'Campaign '+c.id+' · '+c.state,exact:true}).waitFor();return c;}
(async()=>{try{
 const fixture=JSON.parse(py(`import json,secrets
from datetime import timedelta
from uuid import uuid4
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.auth import AuthSession
from app.models.campaign import MarketingPreference,Campaign
from app.schemas.content_support import SaveContent,ContentDecision
from app.services import content_support
from app.security.auth import TEMPLATES,now,digest
from app.security.hashing import hash_password
assert engine.url.host=='db' and engine.url.database=='${database}'
with Session(engine) as db:
 assert db.query(User).count()==0,'Existing campaign fixtures preserved; do not reseed'
 result={}
 for name,email in [('administrator','accounts-admin@example.test'),('member','accounts-member@example.test')]:
  role=Role(name=name);db.add(role);db.flush()
  for code in TEMPLATES[name]:
   p=db.query(Permission).filter_by(code=code).one_or_none()
   if not p:p=Permission(code=code);db.add(p);db.flush()
   db.add(RolePermission(role_id=role.id,permission_id=p.id))
  u=User(email=email,role_id=role.id,is_active=True,password_hash=hash_password(secrets.token_urlsafe(48)));db.add(u);db.flush()
  token=secrets.token_urlsafe(32);db.add(AuthSession(token_hash=digest(token),user_id=u.id,expires_at=now()+timedelta(minutes=30)));result[name]=token
  if name=='administrator':admin=u
 c=content_support.save_content(db,admin,SaveContent(kind='announcement',fields={'title':'TEST ONLY campaign announcement','body':'Published synthetic announcement for local campaign testing.'},request_key=uuid4()))
 for a in ['submit','approve','publish']:c=content_support.content_decision(db,admin,c['id'],ContentDecision(action=a,base_event=c['base_event'],reason='TEST ONLY automated fixture publication; no campaign created by publication',effective_at=now() if a=='publish' else None,request_key=uuid4()))
 content_support.save_content(db,admin,SaveContent(item_id=c['item_id'],base_version=1,kind='announcement',fields={'title':'TEST ONLY campaign announcement','body':'PRIVATE unpublished content not for email.'},request_key=uuid4()))
 assert db.query(MarketingPreference).count()==0 and db.query(Campaign).count()==0
 db.commit();print(json.dumps(result))`));privateTokens=Object.values(fixture);check('publication creates no campaign or consent; only two synthetic accounts',true);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const admin=await browser.newContext({viewport:{width:1440,height:1000}}),member=await browser.newContext({viewport:{width:390,height:844}}),anonymous=await browser.newContext({viewport:{width:390,height:844}});
 for(const [context,token] of [[admin,fixture.administrator],[member,fixture.member]])await context.addCookies([{name:'isave_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const a=await admin.newPage(),m=await member.newPage(),u=await anonymous.newPage();
 stage='anonymous access';await u.goto(origin+'/portal/admin/campaigns');await u.waitForURL('**/login');check('anonymous campaign workspace denied',true);
 stage='consent exclusion';await a.goto(origin+'/portal/admin/campaigns');await a.getByRole('button',{name:'New campaign draft'}).waitFor();let c=await saveDraft(a,'TEST ONLY browser local campaign');let p=await preview(a);check('saved preview excludes accounts without explicit consent',p.eligible_count===0);
 await m.goto(origin+'/portal/member/email-preferences');const opt= m.getByRole('checkbox');await opt.waitFor();check('Member consent is unticked by default',!(await opt.isChecked()));await opt.check();await m.getByRole('button',{name:'Save optional-email preference'}).click();await m.getByText('Your optional-email preference is saved.').waitFor();
 check('mobile preferences fit viewport and keyboard can focus controls',await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.keyboard.press('Tab');check('keyboard focus is on a control',await m.evaluate(()=>document.activeElement!==document.body));
 p=await preview(a);check('preview now counts only the opted-in Member',p.eligible_count===1);
 stage='approval and explicit queue';await action(a,'approve');p=await preview(a);await a.getByLabel('Explicit campaign action').selectOption('queue');check('queue confirmation starts unticked and action disabled',!(await a.getByRole('checkbox').isChecked())&&await a.getByRole('button',{name:'Record campaign action'}).isDisabled());c=await action(a,'queue');
 const captured=await waitFor(async()=>{const d=await mail();return d.messages.find(r=>r.Subject==='[LOCAL TEST ONLY] TEST ONLY browser local campaign');});
 const email=await (await fetch('http://127.0.0.1:18025/api/v1/message/'+captured.ID)).json();const body=email.Text;
 check('one individually addressed campaign captured without shared recipients',email.To.length===1&&email.To[0].Address==='accounts-member@example.test'&&!(email.Cc?.length)&&!(email.Bcc?.length));
 check('email contains exact public version link without unpublished content',typeof body==='string'&&body.includes(p.public_url)&&!body.includes('PRIVATE unpublished'));
 await u.goto(p.public_url);await u.getByRole('heading',{name:'TEST ONLY campaign announcement'}).waitFor();check('email public link opens the exact published content page',await u.getByText('Published synthetic announcement for local campaign testing.').isVisible());
 const unsubscribe=body.match(/http:\/\/127\.0\.0\.1:13080\/unsubscribe#token=[A-Za-z0-9_-]+/)?.[0];if(!unsubscribe)throw Error('Missing private unsubscribe link');
 stage='unsubscribe after queue';c=await saveDraft(a,'TEST ONLY browser queued suppression',new Date(Date.now()+7200000+90000).toISOString().slice(0,16));await action(a,'approve');p=await preview(a);c=await action(a,'queue');
 await u.goto(unsubscribe);await u.getByRole('heading',{name:'Optional email preferences'}).waitFor();check('opening unsubscribe removes fragment and performs no opt-out',new URL(u.url()).hash===''&&(await (await member.request.get(origin+'/api/marketing/preferences')).json()).enabled===true);
 await u.getByRole('checkbox').check();await u.getByRole('button',{name:'Confirm unsubscribe'}).click();await u.getByRole('status').filter({hasText:'Your request has been received'}).waitFor();check('explicit unsubscribe persists without disabling essential workflows',(await (await member.request.get(origin+'/api/marketing/preferences')).json()).enabled===false);
 // Existing security queue is independent of promotional preference. Both private
 // setup messages remain in Mailpit for the short operator rehearsal.
 for(const email of ['accounts-admin@example.test','accounts-member@example.test']){const r=await fetch('http://127.0.0.1:18080/api/v1/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,request_key:crypto.randomUUID()})});if(!r.ok)throw Error('Recovery request rejected');}
 await waitFor(async()=>{const d=await mail();return d.messages.filter(r=>r.Subject.includes('password recovery')).length===2;});check('essential recovery emails captured after marketing withdrawal',true);
 console.log('Waiting for the real scheduled time; no test clock is used.');
 await waitFor(async()=>{const r=await admin.request.get(origin+'/api/campaigns/'+c.id);return r.ok()&&(await r.json()).counts.Suppressed===1;},120);
 const all=await mail();check('withdrawal after queue suppresses scheduled email; no duplicate capture',all.messages.filter(r=>r.Subject.startsWith('[LOCAL TEST ONLY] TEST ONLY browser')).length===1);
 stage='prepare manual draft';const manual=await saveDraft(a,'TEST ONLY manual campaign');p=await preview(a);check('manual draft remains unapproved with zero eligible recipients',manual.state==='Draft'&&p.eligible_count===0);report.manual_campaign_id=manual.id;
 await a.getByRole('button',{name:'Log out',exact:true}).click();await a.waitForURL('**/login');await m.getByRole('button',{name:'Log out',exact:true}).click();await m.waitForURL('**/login');check('automated Admin and Member sessions logged out',true);
 report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failed++;report.failure='Browser checkpoint stopped at '+stage+'; private error details not emitted';console.error(report.failure);process.exitCode=1;}finally{for(const token of privateTokens)await fetch('http://127.0.0.1:18080/api/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});await browser?.close();fs.mkdirSync('docs/announcement-campaigns',{recursive:true});fs.writeFileSync('docs/announcement-campaigns/browser.json',JSON.stringify(report,null,2)+'\n');}})();
