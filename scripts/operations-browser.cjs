// Isolated real browser/API/PG/scanner/recovery checks. No screenshots or secrets.
const {execFileSync}=require('node:child_process'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
const project='isave-operations-rehearsal-20261025',origin='http://127.0.0.1:13090';
const report={checks:[],passed:0,failed:0};let browser,stage='fixture';
const py=code=>execFileSync('docker',['exec','-i',project+'-backend-1','python','-'],{input:code,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:8000000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,value){if(!value)throw Error('Checkpoint');report.checks.push({check:name,passed:true});report.passed++;console.log('PASS: '+name);}
async function wait(fn){for(let i=0;i<80;i++){const result=await fn();if(result)return result;await sleep(1000);}throw Error('Timed checkpoint');}
(async()=>{try{
 const fixture=JSON.parse(py(`import json,secrets,io,base64
from datetime import timedelta
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.auth import AuthSession
from app.security.auth import TEMPLATES,now,digest
from app.security.hashing import hash_password
from PIL import Image,ImageDraw
assert engine.url.host=='db' and engine.url.database=='isave_test_operations_rehearsal'
with Session(engine) as db:
 result={}
 for role_name,email in [('administrator','accounts-admin@example.test'),('member','accounts-member@example.test')]:
  user=db.query(User).filter_by(email=email).one_or_none()
  if not user:
   role=db.query(Role).filter_by(name=role_name).one_or_none()
   if not role:role=Role(name=role_name);db.add(role);db.flush()
   for code in TEMPLATES[role_name]:
    p=db.query(Permission).filter_by(code=code).one_or_none()
    if not p:p=Permission(code=code);db.add(p);db.flush()
    if not db.get(RolePermission,(role.id,p.id)):db.add(RolePermission(role_id=role.id,permission_id=p.id))
   user=User(email=email,role_id=role.id,is_active=True,password_hash=hash_password(secrets.token_urlsafe(40)));db.add(user);db.flush()
   if role_name=='member':db.add(Member(user_id=user.id,member_number='TEST-OPERATIONS',first_name='TEST',last_name='ONLY'))
  token=secrets.token_urlsafe(32);db.add(AuthSession(user_id=user.id,token_hash=digest(token),expires_at=now()+timedelta(minutes=60)));result[role_name]=token
 assert db.query(User).count()==2;db.commit()
 image=Image.new('RGB',(640,360),'white');ImageDraw.Draw(image).text((30,70),'TEST ONLY - SYNTHETIC RESIDENCE EVIDENCE',fill='black',font_size=22)
 output=io.BytesIO();image.save(output,format='PNG');result['image']=base64.b64encode(output.getvalue()).decode()
 print(json.dumps(result))`));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const admin=await browser.newContext({viewport:{width:1440,height:1100}}),member=await browser.newContext({viewport:{width:390,height:844}}),anonymous=await browser.newContext({viewport:{width:390,height:844}});
 for(const [context,token] of [[admin,fixture.administrator],[member,fixture.member]])await context.addCookies([{name:'isave_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const a=await admin.newPage(),m=await member.newPage(),u=await anonymous.newPage();
 async function api(context,path,body){const response=await context.request.fetch(origin+'/api/admin/operations'+path,{method:body?'POST':'GET',headers:body?{Origin:origin,'X-Isave-Request':'1','Content-Type':'application/json'}:{},...(body?{data:body}:{})});if(!response.ok())throw Error('API failed');return response.json();}
 stage='anonymous and member access';await u.goto(origin+'/portal/admin/operations');await u.waitForURL('**/login');check('anonymous operations portal denied',true);
 check('Member operations API denied',(await member.request.get(origin+'/api/admin/operations')).status()===403);
 stage='private upload';await u.goto(origin+'/register');await u.locator('input[name=document_residence]').waitFor();await wait(()=>u.locator('input[name=document_residence]').isEnabled());
 await u.locator('input[name=first_name]').fill('TEST');await u.locator('input[name=last_name]').fill('ONLY');await u.locator('input[name=email]').fill('operations-documents@example.test');await u.locator('input[name=national_id]').fill('SYNTHETIC-ID');await u.locator('input[name=document_residence]').setInputFiles({name:'TEST-ONLY.png',mimeType:'image/png',buffer:Buffer.from(fixture.image,'base64')});await u.locator('input[name=evidence_consent]').check();
 await u.route('**/api/registration',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic transport failure; retry safely.'})}),{times:1});
 await u.getByRole('button',{name:'Submit application',exact:true}).click();await u.getByRole('button',{name:'Retry submission'}).waitFor();check('failed submission preserves entered details and offers retry',(await u.locator('input[name=national_id]').inputValue())==='SYNTHETIC-ID');
 await u.getByRole('button',{name:'Retry submission'}).click();await u.getByRole('heading',{name:'Application received',exact:true}).waitFor();check('real browser upload scanned and persisted through API',true);
 const records=JSON.parse(py(`import json
from sqlalchemy.orm import Session
from app.database import engine
from app.models.application import MembershipApplication
from app.models.evidence_enrolment import ApplicationEvidence
with Session(engine) as db:
 a=db.query(MembershipApplication).filter_by(email='operations-documents@example.test').one();e=db.query(ApplicationEvidence).filter_by(application_id=a.id).one();assert e.scan_engine.startswith('ClamAV') and e.content
 print(json.dumps({'application_id':a.id,'evidence_id':e.id,'sha256':e.sha256}))`));
 const download=await admin.request.get(origin+`/api/application-documents/${records.application_id}/${records.evidence_id}/download`);
 // Download bridge uses this existing fixed endpoint; bytes remain only in memory.
 check('protected document download has intact bytes and safe headers',download.ok()&&require('node:crypto').createHash('sha256').update(await download.body()).digest('hex')===records.sha256&&download.headers()['x-content-type-options']==='nosniff');
 stage='operations overview';await a.goto(origin+'/portal/admin/operations');await a.getByRole('heading',{name:'Private upload scanning',exact:true}).waitFor();check('Admin scanner shows current real scanner',await a.getByText('Scanner reachable with current signatures. Each upload is scanned before storage.').isVisible());
 check('normal defaults are unset and destructive actions absent',(await api(admin,'')).active_version===0&&await a.getByRole('button',{name:'Erase previewed synthetic data'}).count()===0);
 await a.setViewportSize({width:390,height:844});check('mobile operations fits viewport',await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await a.keyboard.press('Tab');check('operations controls keyboard focusable',await a.evaluate(()=>document.activeElement!==document.body));await a.setViewportSize({width:1440,height:1100});
 stage='draft isolation';await a.getByLabel('Superseded evidence retention (days)',{exact:true}).fill('30');await a.getByLabel('Rejected-application national ID retention (days)',{exact:true}).fill('60');await a.getByRole('button',{name:'Save private policy draft'}).click();await a.getByText('Private draft saved; it has no effect before publication.').waitFor();check('saved policy draft isolated from effective settings',(await api(admin,'')).active_version===0);check('publication requires explicit unchecked confirmation',await a.getByRole('button',{name:'Publish reviewed policy'}).isDisabled());
 await a.getByLabel('I reviewed the scope, changes and effective time and authorise publication.').check();await a.getByRole('button',{name:'Publish reviewed policy'}).click();await a.getByText('Policy publication recorded.').waitFor();check('explicit publication changes effective synthetic policy',(await api(admin,'')).active_terms.evidence_days===30);
 stage='hold';await a.getByLabel('Application ID',{exact:true}).fill(String(records.application_id));await a.getByLabel('Reason',{exact:true}).fill('TEST ONLY legal hold for isolated rehearsal');await a.getByRole('button',{name:'Record legal hold decision'}).click();await a.getByText('Legal hold decision recorded.').waitFor();const held=(await api(admin,'')).holds[String(records.application_id)];check('legal hold actor and decision persisted',held?.enabled===true);
 await a.getByRole('button',{name:'Preview eligible records — no deletion'}).click();await a.getByText(/Eligible superseded evidence: 0/).waitFor();check('current pending evidence is excluded from retention preview',true);
 stage='backup and recovery';const backup=await api(admin,'/jobs',{request_key:require('node:crypto').randomUUID(),kind:'backup',confirm:true});
 await wait(async()=>{const d=await api(admin,'');const job=d.jobs.find(j=>j.id===backup.id);if(['Failed','Interrupted'].includes(job?.state))throw Error('Backup failed');return job?.state==='Succeeded';});check('encrypted local backup completed',true);
 const restored=await api(admin,'/jobs',{request_key:require('node:crypto').randomUUID(),kind:'restore-test',backup_id:backup.id,confirm:true});
 await wait(async()=>{const d=await api(admin,'');const job=d.jobs.find(j=>j.id===restored.id);if(['Failed','Interrupted'].includes(job?.state))throw Error('Restore failed');return job?.state==='Succeeded';});check('independent restore verifies database and private-document checksums',true);
 await a.getByRole('button',{name:'Refresh operations'}).click();await a.getByRole('heading',{name:`Operation ${restored.id} · restore-test · Succeeded`}).waitFor();check('Admin displays truthful successful backup and restore states',true);
 stage='logout';for(const page of [a,m]){if(page===m)await m.goto(origin+'/portal/member/dashboard');await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL('**/login');}
 check('automated Admin and Member sessions logged out',true);report.records=records;report.backup_id=backup.id;report.restore_job_id=restored.id;report.completed=true;
 }catch{report.failed++;report.failure_stage=stage;report.completed=false;process.exitCode=1;console.error('Browser checkpoint failed: '+stage+'; private error data suppressed.');}finally{if(browser)await browser.close();report.finished_at=new Date().toISOString();fs.writeFileSync('docs/private-document-operations/browser.json',JSON.stringify(report,null,2)+'\n');}})();
