// Disposable browser checks only. Credentials remain in process memory.
const {execFileSync}=require('node:child_process');
const {chromium}=require('@playwright/test');
const crypto=require('node:crypto'),fs=require('node:fs');
const origin='http://127.0.0.1:13070',container='isave-content-rehearsal-backend-1';
const report={checks:[],passed:0,failed:0};
const resume=process.argv.includes('--resume');
const accounts=[{email:'accounts-admin@example.test',role:'administrator',password:crypto.randomBytes(24).toString('base64url')},{email:'accounts-member@example.test',role:'member',password:crypto.randomBytes(24).toString('base64url')}];
function py(code,input){return execFileSync('docker',['exec','-i',container,'python','-c',code],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});}
function check(name,value){if(!value)throw Error(name);report.checks.push({check:name,passed:true});report.passed++;console.log('PASS: '+name);}
const seed=`import json,sys
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.security.auth import TEMPLATES
from app.security.hashing import hash_password
assert engine.url.database=='isave_test_browser' and engine.url.host=='db'
with Session(engine) as db:
 assert db.query(User).count()==0,'Existing rehearsal accounts preserved; do not reseed'
 for name in ['administrator','member']:
  role=Role(name=name);db.add(role);db.flush()
  for code in TEMPLATES[name]:
   permission=db.query(Permission).filter_by(code=code).one_or_none()
   if not permission:permission=Permission(code=code);db.add(permission);db.flush()
   db.add(RolePermission(role_id=role.id,permission_id=permission.id))
 db.flush()
 for a in json.load(sys.stdin):
  assert not db.query(User).filter_by(email=a['email']).first(),'Existing rehearsal account preserved; do not reseed'
  db.add(User(email=a['email'],password_hash=hash_password(a['password']),role_id=db.query(Role).filter_by(name=a['role']).one().id,is_active=True))
 db.commit()
`;
async function login(page,a){if(resume){const value=py(`import sys,secrets
from datetime import timedelta
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.auth import AuthSession
from app.security.auth import now,digest
assert engine.url.database=='isave_test_browser' and engine.url.host=='db'
with Session(engine) as db:
 u=db.query(User).filter_by(email=sys.stdin.read()).one();assert u.is_active
 token=secrets.token_urlsafe(32);db.add(AuthSession(token_hash=digest(token),user_id=u.id,expires_at=now()+timedelta(minutes=10)));db.commit()
 print(token)
`,a.email).trim();await page.context().addCookies([{name:'isave_session',value,url:origin,httpOnly:true,sameSite:'Strict'}]);await page.goto(origin+'/portal/'+(a.role==='member'?'member':'admin')+'/dashboard');return;}await page.goto(origin+'/login');await page.getByLabel('Email address').fill(a.email);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL('**/portal/**');}
async function action(page,name){await page.getByLabel('Action',{exact:false}).selectOption({label:name});await page.getByLabel('Reason, including required review confirmation').fill('TEST ONLY editorial review');if(name==='Publish approved version'){const v=new Date(Date.now()+7200000-60000).toISOString().slice(0,16);await page.getByLabel('Effective date/time').fill(v);}const response=page.waitForResponse(r=>r.url().endsWith('/decision')&&r.request().method()==='POST');await page.getByRole('button',{name:'Record content action'}).click();if(!(await response).ok())throw Error('Editorial action rejected');await page.getByText('Review action saved. Only effective published versions are public.').waitFor();}
(async()=>{let browser;try{
 if(!resume)py(seed,JSON.stringify(accounts));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(origin+'/announcements');await page.getByText('No approved announcements are published').waitFor();check('public honest empty state',true);
 await page.goto(origin+'/portal/admin/cms');await page.waitForURL('**/login');check('anonymous protected route',true);
 await login(page,accounts[0]);await page.goto(origin+'/portal/admin/cms');if(resume){await page.getByRole('button',{name:/TEST ONLY office announcement/}).click();}else{await page.getByLabel('Title',{exact:true}).fill('TEST ONLY office announcement');await page.getByLabel('Public text').fill('Synthetic announcement for the isolated content rehearsal.');await page.getByRole('button',{name:'Save private draft'}).click();await page.getByText('Private draft saved. The public version has not changed.').waitFor();}
 const publicPage=await browser.newPage();await publicPage.goto(origin+'/announcements');await publicPage.getByText('No approved announcements are published').waitFor();check('saved draft excluded from public page',true);
 await action(page,'Submit for review');await action(page,'Approve reviewed content');await action(page,'Publish approved version');await publicPage.reload();await publicPage.getByRole('heading',{name:'TEST ONLY office announcement'}).waitFor();check('browser publication reaches public page through API/PostgreSQL',true);
 await page.getByLabel('Public text').fill('TEST ONLY PRIVATE subsequent draft.');await page.getByRole('button',{name:'Save private draft'}).click();await page.getByText('Private draft saved. The public version has not changed.').waitFor();await publicPage.reload();check('subsequent draft preserves live published version',!(await publicPage.getByText('TEST ONLY PRIVATE subsequent draft.').count()));
 await publicPage.setViewportSize({width:390,height:844});check('mobile public content has no horizontal overflow',await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await publicPage.keyboard.press('Tab');check('keyboard focus reaches a public control',await publicPage.evaluate(()=>document.activeElement!==document.body));
 await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL('**/login');
 const member=await browser.newPage({viewport:{width:390,height:844}});await login(member,accounts[1]);await member.goto(origin+'/portal/member/support');await member.getByLabel('Subject',{exact:true}).fill('TEST ONLY manual support follow-up');await member.getByLabel('Message',{exact:true}).fill('Synthetic member question for isolated review.');await member.getByRole('button',{name:'Create support ticket'}).click();await member.getByText('Saved. No response deadline is promised.').waitFor();check('owned support ticket persists',true);check('mobile support has no horizontal overflow',await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await login(page,accounts[0]);await page.goto(origin+'/portal/admin/support');await page.getByRole('button',{name:/TEST ONLY manual support follow-up/}).click();await page.getByLabel('Explicit action').selectOption('internal_note');await page.getByLabel('Internal note — never visible').fill('TEST ONLY office private note');await page.getByRole('button',{name:'Save support action'}).click();await page.getByText('Saved. No response deadline is promised.').waitFor();await page.getByLabel('Explicit action').selectOption('reply');await page.getByLabel('Message',{exact:true}).fill('TEST ONLY office reply. Contact the published office for follow-up.');await page.getByRole('button',{name:'Save support action'}).click();await page.getByText('TEST ONLY office reply. Contact the published office for follow-up.',{exact:true}).waitFor();
 await member.reload();await member.getByRole('button',{name:/TEST ONLY manual support follow-up/}).click();await member.getByText('TEST ONLY office reply. Contact the published office for follow-up.',{exact:true}).waitFor();check('member sees persisted staff reply but no internal note',!(await member.getByText('TEST ONLY office private note').count()));
 await member.getByRole('button',{name:'Log out',exact:true}).click();await member.waitForURL('**/login');await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL('**/login');check('both browser sessions logged out',true);
 check('no financial records created',py("from sqlalchemy import text\nfrom app.database import engine\nwith engine.connect() as c:\n assert engine.url.database=='isave_test_browser'\n assert all(c.execute(text('select count(*) from '+t)).scalar()==0 for t in ['savings_contributions','savings_ledger_entries','withdrawal_payouts','subscription_fee_payments'])\nprint('ok')").trim()==='ok');
 }catch(e){report.failed++;report.failure='Browser checkpoint failed; no credentials or raw request details retained';console.error(report.failure);process.exitCode=1;}finally{if(browser)await browser.close();report.finished_at=new Date().toISOString();fs.mkdirSync('docs/content-support',{recursive:true});fs.writeFileSync('docs/content-support/browser.json',JSON.stringify(report,null,2)+'\n');}})();
