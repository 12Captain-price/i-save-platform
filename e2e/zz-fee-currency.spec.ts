import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import policy from '../backend/app/membership_policy.json' with {type:'json'};
const password=randomBytes(24).toString('base64url');
const postHeaders={Origin:'http://127.0.0.1:13000','X-Isave-Request':'1'};
function python(code:string,input?:string){return execFileSync('docker',['compose','-p','isave-browser-auth','-f','compose.auth-test.yaml','exec','-T','backend','python','-c',`from app.database import engine; assert engine.url.database=='isave_test_browser'; `+code],{input,encoding:'utf8',windowsHide:true}).trim();}
test.beforeAll(()=>{
 python(`
import sys,json
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.auth import LoginThrottle
from app.models.application import MembershipApplication
from app.models.fee_currency import FeeRatePublication
from app.security.hashing import hash_password
from app.services import membership
from app.schemas.membership import PaymentRecord
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    if not db.query(User).count():bootstrap(db,'fx-bootstrap@example.test',secret)
    assert not db.query(FeeRatePublication).count(),'Use a fresh disposable test stack'
    db.query(LoginThrottle).delete()
    admin=User(email='fx-admin@example.test',role_id=db.query(Role).filter_by(name='administrator').one().id,is_active=True,password_hash=hash_password(secret));db.add(admin);db.flush()
    for number,email in [('FX-HISTORY','fx-history@example.test'),('FX-REVIEW','fx-member@example.test')]:
        db.add(MembershipApplication(application_number=number,first_name='Rate',last_name='Browser',email=email,status='Pending'))
    db.commit()
    old=db.query(MembershipApplication).filter_by(application_number='FX-HISTORY').one()
    membership.record_payment(db,admin,old.id,PaymentRecord(amount='20',currency='USD',payment_date='2026-01-01',reference='FX-HISTORY-RECEIPT'));db.commit()
    membership.verify_payment(db,admin,old.id);db.commit();membership.approve(db,admin,old.id);db.commit();membership.activate(db,admin,old.id);db.commit()
`,JSON.stringify({password}));
});
async function login(page:Page,email:string){await page.goto('/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/portal\/[^/]+\/dashboard$/);}
function oldFingerprint(){return python(`import json,hashlib; from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; from app.models.membership import ApplicationRegistrationPayment,MembershipApproval; from app.models.subscription import Subscription; from app.models.fee_currency import FeeObligation; db=Session(engine); app=db.query(MembershipApplication).filter_by(application_number='FX-HISTORY').one(); approval=db.get(MembershipApproval,app.id); sub=db.query(Subscription).filter_by(member_id=approval.member_id).one(); rows=[db.get(ApplicationRegistrationPayment,app.id),sub,db.query(FeeObligation).filter_by(application_id=app.id).one(),db.query(FeeObligation).filter_by(subscription_id=sub.id).one()]; print(hashlib.sha256(json.dumps([{c.name:getattr(r,c.name) for c in r.__table__.columns} for r in rows],sort_keys=True,default=str).encode()).hexdigest())`);}

test('unpublished rate, private publication retry, frozen registration and subscription ZiG settlement',async({page})=>{
 test.setTimeout(150_000);const original=oldFingerprint();
 await login(page,'fx-admin@example.test');await page.setViewportSize({width:390,height:844});
 await page.goto('/portal/admin/settings',{waitUntil:'domcontentloaded'});
 const rates=page.getByRole('region',{name:'USD to ZiG fee rates'});
 await expect(rates).toContainText('No effective published rate');await expect(rates).toContainText('Unpublished draft');
 await page.route('**/api/admin/fee-rates/publish',async route=>{const r=await route.fetch();expect(r.status()).toBe(200);await route.abort('failed');},{times:1});
 await rates.getByRole('button',{name:'Publish saved rate'}).click();await expect(rates.getByRole('alert')).toContainText('Rate action could not be confirmed');
 await rates.getByRole('button',{name:'Retry same rate publication'}).click();await expect(rates).toContainText('Effective published rate: 34.00000000');
 expect(oldFingerprint()).toBe(original);
 await page.goto('/portal/admin/registrations',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Find an application').fill('fx-member@example.test');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'View application for Rate Browser'}).click();
 await page.getByRole('button',{name:'Freeze fee obligation and preview payment options'}).click();
 await expect(page.getByText('Exact full-payment options: US$20.00 or ZiG 680.00.')).toBeVisible();
 await page.getByLabel('Payment currency',{exact:true}).selectOption('ZWG');
 const state=await (await page.request.get('/api/admin/fee-rates')).json();
 const draft=await page.request.post('/api/admin/fee-rates',{headers:postHeaders,data:{request_key:randomUUID(),base_version:state.head_version,rate:'35',source:'Synthetic rate published after frozen quote'}});expect(draft.status()).toBe(201);
 expect((await page.request.post('/api/admin/fee-rates/publish',{headers:postHeaders,data:{request_key:randomUUID(),version_id:(await draft.json()).version}})).status()).toBe(200);
 await expect(page.getByText('Exact full-payment options: US$20.00 or ZiG 680.00.')).toBeVisible();
 await page.getByLabel('Receipt / payment reference').fill('FX-BROWSER-ZIG');await page.getByLabel('Payment date',{exact:true}).fill('2026-01-01');
 await page.route('**/api/membership/applications/*/payment',async route=>{const r=await route.fetch();expect(r.status()).toBe(200);await route.abort('failed');},{times:1});
 await page.getByRole('button',{name:'Record ZiG 680 payment'}).click();await expect(page.getByRole('alert')).toContainText('Action could not be confirmed');
 await page.getByRole('button',{name:'Record ZiG 680 payment'}).click();await page.getByRole('button',{name:'Verify ZiG 680 payment'}).click();
 await page.getByRole('checkbox',{name:policy.acknowledgement}).check();await page.getByRole('button',{name:'Approve membership'}).click();await page.getByRole('button',{name:'Activate member account'}).click();await expect(page.getByRole('heading',{name:'Account activated'})).toBeVisible();
 const identifier=python(`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; from app.models.membership import MembershipApproval; from app.models.subscription import Subscription; db=Session(engine); app=db.query(MembershipApplication).filter_by(application_number='FX-REVIEW').one(); print(db.query(Subscription).filter_by(member_id=db.get(MembershipApproval,app.id).member_id).one().id)`);
 await page.goto('/portal/admin/finance',{waitUntil:'domcontentloaded'});const sub=page.getByRole('article',{name:`Subscription ${identifier}`,exact:true});
 await expect(sub).toContainText('US$5.00 or ZiG 175.00');
 await sub.getByLabel(`Settlement currency for subscription ${identifier}`).selectOption('ZWG');await sub.getByLabel(`Payment date for subscription ${identifier}`).fill('2026-01-01');await sub.getByLabel(`Receipt/reference for subscription ${identifier}`).fill('FX-SUB-BROWSER-ZIG');
 await sub.getByRole('button',{name:'Record subscription payment'}).click();await expect(sub).toContainText('Recorded — awaiting verification');await sub.getByRole('button',{name:'Verify subscription payment'}).click();await expect(sub).toContainText('US$5.00 · Paid');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(oldFingerprint()).toBe(original);
 python(`import json,sys; from sqlalchemy.orm import Session; from app.models.user import User; from app.security.hashing import hash_password; db=Session(engine); user=db.query(User).filter_by(email='fx-member@example.test').one(); assert user.is_active and user.password_hash is None; user.password_hash=hash_password(json.load(sys.stdin)['password']); db.commit()`,JSON.stringify({password}));
 await page.getByRole('button',{name:'Log out',exact:true}).click();await login(page,'fx-member@example.test');
 await expect(page.getByText('Actual payment: ZiG 680.00')).toBeVisible();await expect(page.getByText('Savings summary not available yet')).toBeVisible();
 await page.goto('/portal/member/fees',{waitUntil:'domcontentloaded'});await expect(page.getByText('Actual payment: ZiG 680.00')).toBeVisible();await expect(page.getByText(/Actual payment: ZiG 175.00/)).toBeVisible();
 expect((await page.request.get('/api/admin/fee-rates')).status()).toBe(403);expect((await page.request.get('/api/membership/subscriptions')).status()).toBe(403);
 expect(python(`from sqlalchemy.orm import Session; from app.models.audit_event import AuditEvent; from app.models.membership import ApplicationRegistrationPayment; db=Session(engine); assert db.query(ApplicationRegistrationPayment).filter_by(reference='FX-BROWSER-ZIG').count()==1; assert db.query(AuditEvent).filter_by(action='fee_rate_published').count()==2; print('PASS')`)).toBe('PASS');
});
