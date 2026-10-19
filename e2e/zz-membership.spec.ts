import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const password=randomBytes(24).toString('base64url');
const guard=`from app.database import engine; assert engine.url.database=='isave_test_browser','Refusing operational database'; `;
function python(code:string,input?:string){return execFileSync('docker',['compose','-p','isave-browser-auth','-f','compose.auth-test.yaml','exec','-T','backend','python','-c',guard+code],{encoding:'utf8',input,windowsHide:true}).trim();}
const postHeaders={Origin:'http://127.0.0.1:13000','X-Isave-Request':'1'};
const email='workflow-applicant@example.test';
test.beforeAll(()=>{
 python(`
import sys,json
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.models.auth import UserPermission,LoginThrottle
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    assert db.query(User).filter(User.email.like('workflow-%')).count()==0
    db.query(LoginThrottle).delete()
    for name in ['allowed','denied']:
        u=User(email='workflow-'+name+'@example.test',password_hash=hash_password(secret),role_id=db.query(Role).filter_by(name='staff').one().id,is_active=True)
        db.add(u);db.flush()
        if name=='allowed':
            for code in ['registration-fees:record','registration-fees:verify','membership:approve','membership:activate','invitations:issue']:
                db.add(UserPermission(user_id=u.id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit()
`,JSON.stringify({password}));
});
async function login(page:import('@playwright/test').Page,email:string){await page.goto('/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/portal\/\w+\/dashboard$/);}
test('browser submission, same authorised staff records/verifies, approval retry, activation and member paid-fee login',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:390,height:844});await page.goto('/register',{waitUntil:'domcontentloaded'});
 await page.getByLabel('First name (required)').fill('Workflow');await page.getByLabel('Last name (required)').fill('Synthetic');await page.getByLabel('Email address (required)').fill(email);
 await page.getByRole('radio',{name:'Education',exact:true}).locator('..').click();await page.getByRole('button',{name:'Submit application',exact:true}).click();await expect(page.getByRole('heading',{name:'Application received'})).toBeVisible();
 await login(page,'workflow-allowed@example.test');await page.goto('/portal/staff/registrations',{waitUntil:'domcontentloaded'});await page.getByLabel('Find an application').fill(email);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'View application for Workflow Synthetic'}).click();
 const section=page.getByRole('region',{name:'Membership approval and registration fee'});const approve=section.getByRole('button',{name:'Approve membership',exact:true});
 await expect(approve).toBeDisabled();await expect(section.getByRole('checkbox')).not.toBeChecked();await expect(section.getByRole('checkbox')).toBeDisabled();
 const id=Number(python(`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; db=Session(engine); print(db.query(MembershipApplication).filter_by(email='${email}').one().id)`));
 expect((await page.request.post(`/api/membership/applications/${id}/approve`,{headers:postHeaders,data:{acknowledged:true,acknowledgement_version:'membership-review-v1'}})).status()).toBe(409);
 await page.getByLabel('Receipt / payment reference').fill('WORKFLOW-SYNTHETIC-20');await page.getByLabel('Payment date',{exact:true}).fill('2026-01-01');
 // Simulate a lost response after the server commits; entered values remain and retry cannot duplicate payment.
 await page.route(`**/api/membership/applications/${id}/payment`,async route=>{await route.fetch();await route.abort('failed');},{times:1});
 await section.getByRole('button',{name:'Record US$20 payment'}).click();await expect(section.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Receipt / payment reference')).toHaveValue('WORKFLOW-SYNTHETIC-20');
 await section.getByRole('button',{name:'Record US$20 payment'}).click();await expect(section.getByText('Recorded - awaiting verification',{exact:true})).toBeVisible();await expect(approve).toBeDisabled();
 await section.getByRole('button',{name:'Verify US$20 payment'}).click();await expect(section.getByText('Verified',{exact:true})).toBeVisible();await expect(approve).toBeDisabled();
 await section.getByRole('checkbox').focus();await page.keyboard.press('Space');await expect(approve).toBeEnabled();await approve.click();await expect(section.getByRole('heading',{name:'Membership approved'})).toBeVisible();
 await section.getByRole('button',{name:'Activate member account'}).click();await expect(section.getByRole('heading',{name:'Account activated'})).toBeVisible();await expect(section.getByText(/Email delivery unavailable/)).toBeVisible();await expect(section.getByRole('button',{name:'Send password setup invitation'})).toBeDisabled();
 await expect(page.getByText('Education',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/membership-review-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await expect.poll(()=>page.locator('aside').first().evaluate(el=>el.getBoundingClientRect().left)).toBe(0);await page.screenshot({path:'test-results/membership-review-desktop.png',fullPage:true});
 const status=python(`
from sqlalchemy.orm import Session
from app.models.membership import ApplicationRegistrationPayment,MembershipApproval
from app.models.contribution import Contribution
from app.models.subscription import Subscription
with Session(engine) as db:
    a=db.get(MembershipApproval,${id});p=db.get(ApplicationRegistrationPayment,${id})
    assert p.member_id==a.member_id and p.recorded_by==p.verified_by
    assert db.query(ApplicationRegistrationPayment).filter_by(application_id=${id}).count()==1
    assert db.query(Contribution).filter_by(member_id=a.member_id).count()==0
    s=db.query(Subscription).filter_by(member_id=a.member_id).one();assert s.due_date is None
    print('PASS')
`);expect(status).toBe('PASS');
 await page.getByRole('button',{name:'Log out'}).click();await expect(page).toHaveURL(/\/login$/);
 // No email provider exists. Issue only a synthetic fixture invitation directly inside the isolated database.
 const token=python(`
from sqlalchemy.orm import Session
from uuid import uuid4
from app.models.user import User
from app.services.membership import create_invitation
with Session(engine) as db:
    actor=db.query(User).filter_by(email='workflow-allowed@example.test').one()
    token,_=create_invitation(db,actor,${id},uuid4());db.commit();print(token)
`);
 await page.goto('/setup-password#token='+token,{waitUntil:'domcontentloaded'});await page.getByLabel('New password',{exact:true}).fill(password);await expect(page).toHaveURL(/\/setup-password$/);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Set password',exact:true}).click();await expect(page.getByRole('heading',{name:'Password set'})).toBeVisible();
 await login(page,email);await page.goto('/portal/member/fees',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Registration fee — US$20 — Paid'})).toBeVisible();await expect(page.getByText('Reference: WORKFLOW-SYNTHETIC-20')).toBeVisible();await expect(page.getByText('Payment date: 2026-01-01')).toBeVisible();await expect(page.getByText('Due day not configured.')).toBeVisible();
 await page.getByRole('button',{name:'Log out'}).click();await expect(page).toHaveURL(/\/login$/);
});
test('ungranted staff cannot perform payment or approval and unauthenticated URLs remain denied',async({page})=>{
 await login(page,'workflow-denied@example.test');await page.goto('/portal/staff/registrations',{waitUntil:'domcontentloaded'});await page.getByLabel('Find an application').fill(email);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'View application for Workflow Synthetic'}).click();await expect(page.getByRole('heading',{name:'Account activated'})).toBeVisible();
 const id=Number(python(`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; db=Session(engine); print(db.query(MembershipApplication).filter_by(email='${email}').one().id)`));
 for(const action of ['payment','verify','approve','activate'])expect((await page.request.post(`/api/membership/applications/${id}/${action}`,{headers:postHeaders,data:{}})).status()).toBe(403);
 await page.getByRole('button',{name:'Log out'}).click();expect((await page.request.get(`/api/membership/applications/${id}`)).status()).toBe(401);
 await page.goto('/setup-password',{waitUntil:'domcontentloaded'});await expect(page.getByRole('alert')).toContainText('A valid private invitation link is required');
});
