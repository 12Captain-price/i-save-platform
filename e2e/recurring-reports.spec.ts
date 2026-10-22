import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const password=randomBytes(24).toString('base64url');
const admin='recurring-admin@example.test',member='recurring-member@example.test';
function python(code:string,input:object={}){
 return execFileSync('docker',['exec','-i',(process.env.ISAVE_E2E_PROJECT??'isave-recurring-browser')+'-backend-1','python','-c',"from app.database import engine; assert engine.url.database=='isave_test_browser'; "+code],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
}
test.beforeAll(()=>python(`
import json,sys
from datetime import datetime,timezone
from uuid import uuid4
from sqlalchemy.orm import Session
from app.savings_rehearsal import seed
from app.models.membership import MembershipApproval
from app.models.business_settings import BusinessSettingsVersion,BusinessSettingsPublication
from app.services.business_settings import active
from app.models.user import User
from app.security.auth import now
d=json.load(sys.stdin)
with Session(engine) as db:
 seed(db,d['admin'],d['password'],d['member'],d['password'])
 approval=db.query(MembershipApproval).one()
 approval.activated_at=datetime(2026,8,15,tzinfo=timezone.utc);approval.subscription_start_month='2026-09'
 actor=db.query(User).filter_by(email=d['admin']).one()
 version,terms=active(db)
 row=BusinessSettingsVersion(base_version=version,request_key=str(uuid4()),snapshot=json.dumps({**terms,'subscription_separation':'same_actor_allowed'}),actor_id=actor.id,actor_email=actor.email)
 db.add(row);db.flush();db.add(BusinessSettingsPublication(version_id=row.id,request_key=str(uuid4()),request_snapshot='TEST ONLY synthetic subscription same-actor policy; not normal approval',effective_at=now(),actor_id=actor.id,actor_email=actor.email));db.commit()
`,{admin,member,password}));
async function login(page:import('@playwright/test').Page,email:string){await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL('**/portal/**/dashboard');}
test('preview, catch-up, payment and report reconcile without savings credit',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await login(page,admin);await page.goto('/portal/admin/finance');
 await page.getByRole('button',{name:'Preview missing obligations'}).click();await expect(page.getByText('2 missing obligations')).toBeVisible();
 expect(python("from sqlalchemy.orm import Session; from app.models.subscription import Subscription; db=Session(engine); print(db.query(Subscription).count())")).toBe('0');
 await page.getByRole('button',{name:'Run monthly generation'}).click();await expect(page.getByText('2 obligations created')).toBeVisible();
 await page.getByRole('button',{name:'Refresh subscription payments'}).click();
 const article=page.getByRole('article').filter({hasText:'2026-09'});await expect(article).toHaveCount(1);
 await article.locator('input[type=date]').fill('2026-10-22');await article.locator('input[maxlength="80"]').fill('SYNTHETIC-RECURRING-001');await article.getByRole('button',{name:'Record subscription payment'}).click();
 await expect(article.getByText('Recorded — awaiting verification')).toBeVisible();await article.getByRole('button',{name:'Verify subscription payment'}).click();await expect(article.getByText(/Verified by/)).toBeVisible();
 await page.goto('/portal/admin/reports');await page.getByLabel('From (inclusive)').fill('2026-09-01');await page.getByLabel('To (inclusive)').fill('2026-10-31');await page.getByRole('button',{name:'Load report'}).click();
 await expect(page.getByText('subscription_payments · Verified · USD 5.00',{exact:true})).toBeVisible();await expect(page.getByText('subscription_obligations · Pending · USD 5.00',{exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export filtered CSV'}).click();expect((await download).suggestedFilename()).toBe('financial-report.csv');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Log out',exact:true}).click();
});
test('member sees owned paid fee, no savings increase and no organisation reports',async({page})=>{
 await login(page,member);await expect(page.getByText('No confirmed ledger credits recorded.')).toBeVisible();await page.goto('/portal/member/fees');await expect(page.getByText(/Reference: SYNTHETIC-RECURRING-001/)).toBeVisible();
 expect((await page.request.get('/api/financial/reports?start=2026-09-01&end=2026-10-31')).status()).toBe(403);
 await page.getByRole('button',{name:'Log out',exact:true}).click();
});
