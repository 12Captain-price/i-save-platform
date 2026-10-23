// One-shot, explicitly authorised disposable browser recording. No credentials
// are reset/read; a short-lived synthetic session stays only in pipe memory and
// is revoked in finally. Refuses an existing payout and any other environment.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const {chromium}=require('playwright');
const target='isave-withdrawal-rehearsal';
const origin='http://127.0.0.1:13050';
if(fs.existsSync('docs/withdrawals/single-browser-recording.json')&&JSON.parse(fs.readFileSync('docs/withdrawals/single-browser-recording.json','utf8')).recorded===true){
 console.log('This one-shot recording is already complete. No browser or database command was run.');
 process.exit(0);
}
function python(code,input=''){
 return execFileSync('docker',['exec','-i',target+'-backend-1','python','-c',code],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();
}
let browser,context,privateSession;
const evidence={started_at:new Date().toISOString(),scope:target,post_count:0};
(async()=>{
 try{
  const containers=JSON.parse(execFileSync('docker',['inspect',target+'-frontend-1',target+'-backend-1',target+'-db-1'],{encoding:'utf8',stdio:'pipe',windowsHide:true}));
  if(containers.some(c=>c.Config.Labels['com.docker.compose.project']!==target||Object.keys(c.NetworkSettings.Networks).some(n=>n!==target+'_default')))throw Error('Target refused');
  if(!containers[0].Config.Env.includes('AUTH_API_ORIGIN=http://backend:8000'))throw Error('Frontend target refused');
  evidence.stage='guarded_session';privateSession=JSON.parse(python(`
import json,secrets
from datetime import timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from app.withdrawal_rehearsal import guard,clock
from app.database import engine
from app.models.withdrawal import WithdrawalRequest,WithdrawalEvent,WithdrawalPayout,WithdrawalDebit
from app.models.user import User
from app.models.auth import AuthSession
from app.models.audit_event import AuditEvent
from app.security.auth import now,digest,permissions
from app.services.fee_currency import check_reference
guard()
with Session(engine) as db:
 r=db.query(WithdrawalRequest).one()
 assert r.id==1 and r.enrolment_id==3 and r.status=='Processing'
 assert db.query(WithdrawalPayout).count()==0 and db.query(WithdrawalDebit).count()==0
 assert clock().isoformat()=='2026-10-22T23:06:00+00:00'
 assert r.notice_ends_at<=clock()
 actor=db.query(User).filter_by(email='savings-admin@example.test').one()
 assert actor.is_active and actor.role.name=='administrator'
 assert {'withdrawals:read','withdrawals:process'}<=permissions(db,actor)
 assert db.query(WithdrawalEvent).filter_by(withdrawal_id=1,action='process').one().actor_id==actor.id
 check_reference(db,'TEST-ONLY-WITHDRAWAL-PAYOUT-001')
 token=secrets.token_urlsafe(32)
 db.add(AuthSession(token_hash=digest(token),user_id=actor.id,expires_at=now()+timedelta(minutes=5)))
 db.add(AuditEvent(event_type='test_fixture',actor_user_id=actor.id,actor_email=actor.email,action='disposable_browser_session_created',target_table='users',target_id=str(actor.id),details='TEST ONLY short-lived session for explicitly authorised single payout recording; no credential reset or permission change.'))
 db.commit()
 print(json.dumps({'token':token,'local_time':clock().astimezone(ZoneInfo('Africa/Harare')).strftime('%Y-%m-%dT%H:%M:%S'),'payment_date':str(clock().astimezone(ZoneInfo('Africa/Harare')).date()),'expected_utc':clock().isoformat(),'deadline':r.notice_ends_at.isoformat()}))
`));
  evidence.stage='browser_launch';browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context=await browser.newContext({timezoneId:'UTC',baseURL:origin});
  await context.addCookies([{name:'isave_session',value:privateSession.token,url:origin,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();
   if(!['GET','HEAD'].includes(req.method())){
    if(req.method()==='POST'&&url.pathname==='/api/withdrawals/1/record'&&evidence.post_count===0){
     evidence.post_count++;const body=req.postDataJSON();
     evidence.actual_request={payment_at:body.payment_at,payment_date:body.payment_date,method:body.method,payment_reference:body.payment_reference};
     if(body.payment_at!=='2026-10-22T23:06:00.000Z'||body.payment_date!=='2026-10-23')return route.abort();
    }else if(!(req.method()==='POST'&&url.pathname==='/api/auth/logout'))return route.abort();
   }
   return route.continue();
  });
  const page=await context.newPage();
  evidence.stage='navigate';await page.goto('/portal/admin/withdrawals');
  const row=page.getByRole('article',{name:'Withdrawal 1',exact:true});
  evidence.stage='select_record';await row.getByRole('combobox',{name:/^Action/}).selectOption('record');
  evidence.stage='fill_record';await row.getByLabel('Reason',{exact:true}).fill('TEST ONLY synthetic cash payout evidence; no real transfer');
  await row.getByLabel('Review evidence/reference').fill('TEST-WITHDRAWAL-RECORD-001');
  await row.getByLabel('Manual payout method').selectOption('manual_cash');
  evidence.stage='fill_harare_time';evidence.input={local_time:privateSession.local_time,payment_date:privateSession.payment_date};await row.getByLabel('Actual payout date and time (Harare, UTC+02:00)').fill(privateSession.local_time.slice(0,16));
  evidence.stage='fill_payment_date';await row.getByLabel('Harare payment date',{exact:true}).fill(privateSession.payment_date);
  await row.getByLabel('Unique actual payment reference').fill('TEST-ONLY-WITHDRAWAL-PAYOUT-001');
  await row.getByRole('checkbox').check();
  evidence.browser=await page.evaluate(()=>({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,entered:document.querySelector('input[type="datetime-local"]')?.value,paymentDate:document.querySelector('input[type="date"]')?.value}));
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/withdrawals/1/record'&&r.request().method()==='POST');
  evidence.stage='submit_record';await row.getByRole('button',{name:'Record withdrawal action'}).click();
  const response=await responsePromise;const result=await response.json();evidence.http_status=response.status();
  if(!response.ok()){evidence.error=typeof result.error==='string'?result.error:'Recording refused';throw Error('Recording refused');}
  evidence.recorded=result.status==='Recorded'&&!!result.payout&&!result.payout.verified_at&&!result.debit&&!result.receipt_available;
  if(!evidence.recorded)throw Error('Unexpected state');
  await page.getByText('Manual evidence - not a verified paid receipt',{exact:true}).waitFor();
  console.log('PASS: exactly one actual browser POST returned Recorded; no verification action was attempted');
 }catch(error){
  evidence.error_type=error?.name??'Error';
  if(['navigate','select_record','fill_record','fill_harare_time','fill_payment_date','submit_record'].includes(evidence.stage))evidence.browser_error=String(error?.message??'').split('\n')[0];
  evidence.failure='Single recording did not complete as expected; inspect the safe actual-request evidence before any retry.';
  console.error(evidence.error??evidence.failure);process.exitCode=1;
 }finally{
  if(privateSession){
   // Revoke only this automation session, never the user's existing sessions.
   try{
    if(context)await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin,'X-Isave-Request':'1'}});
    evidence.automation_session_revoked=python(`
import sys,json
from sqlalchemy.orm import Session
from app.withdrawal_rehearsal import guard
from app.database import engine
from app.models.auth import AuthSession
from app.security.auth import digest,now
guard();token=json.load(sys.stdin)['token']
with Session(engine) as db:
 session=db.get(AuthSession,digest(token))
 if session and not session.revoked_at:session.revoked_at=now();db.commit()
 print('revoked' if session and session.revoked_at else 'failed')
`,JSON.stringify({token:privateSession.token}))==='revoked';
   }catch{evidence.automation_session_revoked=false;process.exitCode=1;}
  }
  await browser?.close();
  fs.mkdirSync('docs/withdrawals',{recursive:true});
  fs.writeFileSync('docs/withdrawals/single-browser-recording.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('Safe browser recording evidence saved; no credentials, tokens, private headers or full responses printed');
 }
})();
