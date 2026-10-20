import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const password=randomBytes(24).toString('base64url');
const compose=['compose','-p','isave-browser-auth','-f','compose.auth-test.yaml'];
const guard="from app.database import engine; assert engine.url.database=='isave_test_browser','Refusing operational database'; ";
function python(code:string,input?:object){return execFileSync('docker',[...compose,'exec','-T','backend','python','-c',guard+code],{encoding:'utf8',windowsHide:true,...(input?{input:JSON.stringify(input)}:{})}).trim();}
test.beforeAll(()=>{
 python(`
import sys,json
from decimal import Decimal
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.application import MembershipApplication,SavingsInterest
from app.models.membership import MembershipApproval
from app.models.contribution import Contribution
from app.models.auth import UserPermission,LoginThrottle
from app.models.permission import Permission
from app.models.savings_plan import SavingsPlan
from app.models.member_plan import MemberPlan
from app.schemas.membership import PaymentRecord
from app.services import membership
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    assert db.query(User).filter(User.email.like('overview-%')).count()==0
    if db.query(User).count()==0:bootstrap(db,'overview-admin@example.test',secret)
    db.query(LoginThrottle).delete()
    actor=db.query(User).join(Role).filter(Role.name=='administrator').first()
    a=MembershipApplication(application_number='OVERVIEW-APP',first_name='Overview',last_name='Synthetic',email='overview-populated@example.test',status='Pending')
    db.add(a);db.commit()
    db.add(SavingsInterest(application_id=a.id,category='education',category_label='Education',purpose='Saved education purpose',notice_version='saved-interest-v1',notice_text='Historical expression of interest. Plan terms awaiting confirmation.'))
    membership.record_payment(db,actor,a.id,PaymentRecord(amount='20.00',currency='USD',payment_date='2026-01-01',reference='OVERVIEW-PAID'))
    db.commit();membership.verify_payment(db,actor,a.id);db.commit();membership.approve(db,actor,a.id);db.commit();membership.activate(db,actor,a.id);db.commit()
    approval=db.get(MembershipApproval,a.id);user=db.get(User,approval.user_id);user.password_hash=hash_password(secret)
    for currency,value in [('USD','123.45'),('ZAR','999.00')]:db.add(Contribution(contribution_reference='OVERVIEW-'+currency,member_id=approval.member_id,amount=Decimal(value),currency=currency,status='Verified'))
    plan=SavingsPlan(name='Legacy recorded link');db.add(plan);db.flush();db.add(MemberPlan(member_id=approval.member_id,plan_id=plan.id,is_active=True))
    member_role=db.query(Role).filter_by(name='member').one()
    for name in ['empty','unlinked','denied']:
        u=User(email='overview-'+name+'@example.test',password_hash=hash_password(secret),role_id=member_role.id,is_active=True);db.add(u);db.flush()
        if name!='unlinked':db.add(Member(member_number='OVERVIEW-'+name,first_name='Overview',last_name=name,user_id=u.id))
        if name=='denied':db.add(UserPermission(user_id=u.id,permission_id=db.query(Permission).filter_by(code='fees:own').one().id,allowed=False))
    db.commit()
`,{password});
});
async function login(page:Page,name:string){await page.goto('/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill('overview-'+name+'@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/portal\/member\/dashboard$/);}
async function logout(page:Page){await page.getByRole('button',{name:'Log out'}).click();await expect(page).toHaveURL(/\/login$/);}
test('populated overview, Fees consistency, separate interest and savings, desktop/mobile keyboard links',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await login(page,'populated');
 await expect(page.getByText('Activated',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Registration fee — US$20 — Paid'})).toBeVisible();await expect(page.getByText('Education',{exact:true})).toBeVisible();await expect(page.getByText(/Subscriptions begin November 2026/)).toBeVisible();await expect(page.getByText('Savings summary not available yet')).toBeVisible();
 const body=await page.locator('main').innerText();expect(body).not.toMatch(/123\.45|999|Overdue|Savings balance|Legacy recorded link/);expect(body).toContain('not an approved savings-plan enrolment');
 const overview=await (await page.request.get('/api/membership/overview')).json();const fees=await (await page.request.get('/api/membership/fees')).json();expect(overview.fees).toEqual(fees);
 expect((await page.request.get('/api/membership/overview?member_id=999')).status()).toBe(404);
 await page.screenshot({path:'test-results/member-overview-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator('aside').first().evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/member-overview-mobile.png',fullPage:true});
 const link=page.getByRole('link',{name:'View all fees'});await link.focus();await expect(link).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/portal\/member\/fees$/);await expect(page.getByRole('heading',{name:'Registration fee — US$20 — Paid'})).toBeVisible();await expect(page.getByText('Due day not configured.')).toBeVisible();await logout(page);
});
test('empty, unlinked and denied accounts show distinct states with no other member data',async({page,request})=>{
 expect((await request.get('http://127.0.0.1:18000/api/v1/membership/overview')).status()).toBe(401);
 expect((await page.request.get('/api/membership/overview')).status()).toBe(401);
 for(const name of ['empty','unlinked','denied']){
  await login(page,name);
  if(name==='denied')await expect(page.getByRole('heading',{name:'Access denied'})).toBeVisible();
  else {await expect(page.getByText('No subscriptions recorded.')).toBeVisible();await expect(page.getByText('No savings-category interest recorded.')).toBeVisible();if(name==='unlinked')await expect(page.getByRole('heading',{name:'No member record linked'})).toBeVisible();}
  expect(await page.locator('main').innerText()).not.toMatch(/OVERVIEW-PAID|Saved education purpose|Registration fee — US\$20/);await logout(page);
 }
});
test('loading, failure/retry and database-backed session expiry',async({page})=>{
 let release:()=>void=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/membership/overview',async route=>{await hold;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary failure'})});},{times:1});
 await login(page,'empty');await expect(page.getByText('Loading your membership overview...')).toBeVisible();release();await expect(page.getByRole('heading',{name:'Unable to load records'})).toBeVisible();await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No subscriptions recorded.')).toBeVisible();
 python(`from sqlalchemy.orm import Session; from app.models.auth import AuthSession; from app.models.user import User; from app.security.auth import now; from datetime import timedelta; db=Session(engine); user=db.query(User).filter_by(email='overview-empty@example.test').one(); db.query(AuthSession).filter_by(user_id=user.id).update({'expires_at':now()-timedelta(seconds=1)}); db.commit()`);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page).toHaveURL(/\/login$/);await expect(page.getByText('Your session has expired. Please log in again.')).toBeVisible();
});
