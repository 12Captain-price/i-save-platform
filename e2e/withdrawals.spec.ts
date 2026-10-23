import {test,expect,Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
test.describe.configure({mode:'serial'});
test.use({timezoneId:'Africa/Harare'});
const password=randomBytes(24).toString('base64url');
const project=process.env.ISAVE_E2E_PROJECT??'isave-withdrawal-browser';
const admin='withdrawal-admin@example.test',member='withdrawal-member@example.test';
function python(code:string,input:object={}){return execFileSync('docker',['exec','-i',project+'-backend-1','python','-c',code],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
test.beforeAll(()=>python(`
import json,sys,io
from app.security.hashing import hash_password
from app.withdrawal_rehearsal import prepare
d=json.load(sys.stdin)
sys.stdin=io.StringIO(json.dumps({k:{'email':d[k],'password_hash':hash_password(d['password'])} for k in ['admin','member']}))
prepare()
`,{admin,member,password}));
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL('**/portal/**/dashboard');}
async function action(page:Page,kind:string){
 const article=page.getByRole('article',{name:'Withdrawal 1',exact:true});
 await article.getByRole('combobox',{name:/^Action/}).selectOption(kind);await article.getByLabel('Reason',{exact:true}).fill('TEST ONLY synthetic reviewed evidence');await article.getByLabel('Review evidence/reference',{exact:true}).fill('TEST-'+kind);
 if(kind==='record'){
  const info=JSON.parse(python("import json; from app.withdrawal_rehearsal import guard,clock; guard(); t=clock().astimezone(__import__('zoneinfo').ZoneInfo('Africa/Harare')); print(json.dumps({'at':t.isoformat(),'date':t.date().isoformat()}))"));
  await article.getByLabel('Manual payout method').selectOption('manual_cash');await article.getByLabel('Actual payout date and time (Harare, UTC+02:00)').fill(info.at.slice(0,16));await article.getByLabel('Harare payment date').fill(info.date);await article.getByLabel('Unique actual payment reference').fill('TEST-ONLY-WITHDRAWAL-001');
 }
 await article.getByRole('checkbox').check();await article.getByRole('button',{name:'Record withdrawal action'}).click();
}
test('member rejects premature access, reserves eligible funds and excludes other currency',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,member);await page.goto('/portal/member/withdrawals');
 await expect(page.getByText('Programme completion is required before requesting withdrawal')).toBeVisible();
 const cards=page.getByRole('article');const premature=cards.filter({hasText:'Enrolment 2 - USD'});await expect(premature.getByRole('button',{name:'Submit withdrawal request'})).toBeDisabled();
 const zig=cards.filter({hasText:'Enrolment 3 - ZWG'});await expect(zig.getByText('No unreserved confirmed savings are available for this enrolment')).toBeVisible();
 expect((await page.request.post('/api/withdrawals',{headers:{'X-Isave-Request':'1',Origin:process.env.ISAVE_E2E_ORIGIN??'http://127.0.0.1:13000'},data:{request_key:randomUUID(),enrolment_id:2,amount:'1',currency:'USD',acknowledged:true}})).status()).toBe(409);
 const eligible=cards.filter({hasText:'Enrolment 1 - USD'});await eligible.getByLabel('Amount in USD').fill('10');await eligible.getByRole('checkbox').focus();await page.keyboard.press('Space');await eligible.getByRole('button',{name:'Submit withdrawal request'}).click();
 await expect(page.getByText('Withdrawal 1 - USD 10.00 - Requested')).toBeVisible();
 expect(python("from app.withdrawal_rehearsal import guard; guard(); from sqlalchemy.orm import Session; from app.database import engine; from app.services.withdrawals import funds; db=Session(engine); print(funds(db,1)['reserved'])")).toBe('10.00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Log out',exact:true}).click();
});
test('office approval creates no debit; notice blocks payout; synthetic verified payout posts once',async({page})=>{
 await login(page,admin);await page.goto('/portal/admin/withdrawals');await action(page,'approve');await expect(page.getByText('Withdrawal 1 - USD 10.00 - Approved')).toBeVisible();
 await action(page,'process');await expect(page.getByRole('alert')).toContainText('two-week notice');
 expect(python("from app.withdrawal_rehearsal import guard; guard(); from sqlalchemy.orm import Session; from app.database import engine; from app.models.withdrawal import WithdrawalDebit; db=Session(engine); print(db.query(WithdrawalDebit).count())")).toBe('0');
 python('from app.withdrawal_rehearsal import advance; advance()');await action(page,'process');await expect(page.getByText('Withdrawal 1 - USD 10.00 - Processing')).toBeVisible();
 await action(page,'record');await expect(page.getByText('Manual evidence - not a verified paid receipt')).toBeVisible();await action(page,'verify');await expect(page.getByText('Verified manual payout receipt')).toBeVisible();
 const proof=JSON.parse(python("import json; from app.withdrawal_rehearsal import guard; guard(); from sqlalchemy.orm import Session; from app.database import engine; from app.models.withdrawal import WithdrawalDebit,WithdrawalEvent; from app.services.withdrawals import funds; db=Session(engine); print(json.dumps({'debits':db.query(WithdrawalDebit).count(),'balance':funds(db,1),'events':db.query(WithdrawalEvent).count()}))"));
 expect(proof).toEqual({debits:1,balance:{confirmed:'0.00',reserved:'0.00',available:'0.00'},events:5});await page.getByRole('button',{name:'Log out',exact:true}).click();
});
test('member receipt and savings agree with exactly one retained debit',async({page})=>{
 await login(page,member);await page.goto('/portal/member/withdrawals');await expect(page.getByText('Verified manual payout receipt')).toBeVisible();expect((await page.request.get('/api/withdrawals/1/receipt')).status()).toBe(200);
 await page.goto('/portal/member/dashboard');await expect(page.getByText('USD 0.00',{exact:true})).toBeVisible();expect((await page.request.post('/api/withdrawals/1/verify',{headers:{'X-Isave-Request':'1',Origin:process.env.ISAVE_E2E_ORIGIN??'http://127.0.0.1:13000'},data:{request_key:randomUUID(),base_event_id:5,reason:'Denied',evidence_reference:'Denied'}})).status()).toBe(403);
 await page.getByRole('button',{name:'Log out',exact:true}).click();expect((await page.request.get('/api/withdrawals')).status()).toBe(401);
});
