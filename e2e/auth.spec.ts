import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const password = randomBytes(24).toString('base64url');
const compose = ['compose', '-p', 'isave-browser-auth', '-f', 'compose.auth-test.yaml'];
function python(code: string, input?: string) {
  return execFileSync('docker', [...compose, 'exec', '-T', 'backend', 'python', '-c', code],
    { input, encoding: 'utf8', windowsHide: true });
}
const guard = `from app.database import engine; assert engine.url.database == 'isave_test_browser', 'Refusing operational database'; `;

test.beforeAll(() => {
  python(guard + `
import sys,json
from sqlalchemy.orm import Session
from app.bootstrap import bootstrap
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.security.hashing import hash_password
secret=json.load(sys.stdin)['password']
with Session(engine) as db:
    assert db.query(User).count()==0, 'Use a fresh disposable test stack'
    bootstrap(db,'browser-admin@example.test',secret)
    for name in ('member','other','staff','finance'):
        role=db.query(Role).filter_by(name='member' if name=='other' else name).one()
        user=User(email='browser-'+name+'@example.test',password_hash=hash_password(secret),role_id=role.id,is_active=True)
        db.add(user);db.flush()
        if name in ('member','other'):
            db.add(Member(member_number='BROWSER-'+name,first_name='Synthetic',last_name=name,user_id=user.id))
    db.commit()
`, JSON.stringify({ password }));
});

for (const role of ['member', 'staff', 'finance', 'admin']) {
  test(`${role}: browser login, role isolation, reload and PostgreSQL logout revocation`, async ({ page, context, request }) => {
    await page.goto(`/portal/${role}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email address', { exact: true }).fill(`browser-${role}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${role}/dashboard$`));
    await expect(role === 'admin' ? page.getByTestId('count-Member records') : page.getByText('This screen is not available yet')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/Tariro Moyo|\$[0-9]|Demo preview|demonstration/i);
    const session = (await context.cookies()).find(c => c.name === 'isave_session');
    expect(!!session?.httpOnly && session.sameSite === 'Strict').toBe(true);
    expect(await page.evaluate(() => document.cookie.includes('isave_session'))).toBe(false);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    const token = session?.value;
    if (!token) throw new Error('Session cookie missing');
    const authorization = { Authorization: `Bearer ${token}` };
    expect((await request.get('http://127.0.0.1:18000/api/v1/auth/me', { headers: authorization })).status()).toBe(200);
    if (role === 'member') {
      const members = await request.get('http://127.0.0.1:18000/api/v1/members', { headers: authorization });
      expect((await members.json()).length).toBe(1);
      expect((await request.get('http://127.0.0.1:18000/api/v1/members/2', { headers: authorization })).status()).toBe(404);
      expect((await request.get('http://127.0.0.1:18000/api/v1/users', { headers: authorization })).status()).toBe(403);
      expect((await page.request.get('/api/admin/members')).status()).toBe(403);
      expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(role === 'admin' ? page.getByTestId('count-Member records') : page.getByText('This screen is not available yet')).toBeVisible();
    await page.goto(`/portal/${role === 'admin' ? 'member' : 'admin'}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/portal/${role}/dashboard$`));
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await request.get('http://127.0.0.1:18000/api/v1/auth/me', { headers: authorization })).status()).toBe(401);
    expect((await context.cookies()).some(c => c.name === 'isave_session')).toBe(false);
    const active = python(guard + `from sqlalchemy.orm import Session; from app.models.auth import AuthSession; db=Session(engine); print(db.query(AuthSession).filter(AuthSession.revoked_at.is_(None)).count())`).trim();
    expect(active).toBe('0');
    await page.goto(`/portal/${role}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('real database expiry clears the workspace and prompts login', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address', { exact: true }).fill('browser-member@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/member\/dashboard$/);
  python(guard + `from sqlalchemy import text; c=engine.connect(); c.execute(text("UPDATE auth_sessions SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE revoked_at IS NULL")); c.commit()`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Your session has expired. Please log in again.')).toBeVisible();
  await expect(page.getByText('This screen is not available yet')).not.toBeVisible();
});

test('invalid login errors, unsupported account pages and login CSRF refusal', async ({ page, request }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address', { exact: true }).fill('missing@example.test');
  await page.getByLabel('Password', { exact: true }).fill(randomBytes(12).toString('hex'));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  expect((await request.post('/api/auth/login', { data: { email: 'browser-admin@example.test', password }, headers: { Origin: 'https://attacker.test', 'X-Isave-Request': '1' } })).status()).toBe(403);
  for (const path of ['/recovery','/verify','/setup-password']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('This service is not available online yet.')).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
  }
  await page.goto('/portal/member/login', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login$/);
});

 test('admin directory: real counts, pagination, search, mobile and empty records', async ({ page }) => {
  python(guard + `from sqlalchemy.orm import Session; from app.models.member import Member; db=Session(engine); db.add_all([Member(member_number='SYN-%02d'%i,first_name='Directory',last_name='Person%02d'%i,email='person%02d@example.test'%i) for i in range(13)]); db.commit()`);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address', { exact: true }).fill('browser-admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('count-Member records')).toHaveText('15');
  await expect(page.getByTestId('count-With a linked account')).toHaveText('2');
  await expect(page.getByTestId('count-Without an account link')).toHaveText('13');
  await expect(page.getByTestId('count-Login accounts')).toHaveText('5');
  await page.screenshot({ path: 'test-results/admin-overview-desktop.png' });
  await page.getByRole('link', { name: 'Open members', exact: true }).click();
  await expect(page.getByText('15 members recorded')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByLabel('Find a member').fill('PERSON12@EXAMPLE');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('1 member found')).toBeVisible();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await expect(page.locator('tbody')).toContainText('Directory Person12');
  await page.getByLabel('Find a member').fill('no-such-member');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No members match your search')).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByLabel('Rows per page').selectOption('25');
  await expect(page.locator('tbody tr')).toHaveCount(15);
  await page.screenshot({ path: 'test-results/admin-members-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.locator('aside').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-member-card]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Open portal menu' }).click();
  await expect(page.getByRole('button', { name: 'Close portal menu' })).toBeInViewport();
  await page.getByRole('button', { name: 'Close portal menu' }).click();
  await expect.poll(async () => page.locator('aside').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-members-mobile.png' });
  // SQL writes below are guarded to the disposable database; preserve linked fixture dependants.
  python(guard + `from sqlalchemy import text; c=engine.connect(); c.execute(text('DELETE FROM members')); c.commit()`);
  await page.getByRole('button', { name: 'Refresh members' }).click();
  await expect(page.getByText('No member records yet')).toBeVisible();
  await page.goto('/portal/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('count-Member records')).toHaveText('0');
  await expect(page.getByText('No member records yet')).toBeVisible();
  // An administrator role cannot bypass an individual backend permission denial.
  python(guard + `from sqlalchemy import text; c=engine.connect(); c.execute(text("INSERT INTO user_permissions(user_id,permission_id,allowed) SELECT u.id,p.id,false FROM users u CROSS JOIN permissions p WHERE u.email='browser-admin@example.test' AND p.code='members:read'")); c.commit()`);
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByTestId('count-Member records')).toHaveCount(0);
  await page.goto('/portal/admin/members', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
 });



test('public pending registration and authorised Staff/Admin review without activation', async ({page})=>{
 test.setTimeout(90_000);
 expect((await page.request.get('/api/review/applications')).status()).toBe(401);
 await page.goto('/register',{waitUntil:'domcontentloaded'});
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('First name (required)').fill('Public');
 await page.getByLabel('Last name (required)').fill('Synthetic');
 await page.getByLabel('Email address (required)').fill('public-applicant@example.test');
 await page.getByLabel('Phone (optional)').fill('+27000123456');
 await page.getByLabel('Reason for applying (optional)').fill('Synthetic browser registration only.');
 await page.getByRole('radio',{name:'Education',exact:true}).locator('..').click();
 await expect(page.getByRole('radio',{name:'Education',exact:true})).toBeChecked();
 await expect(page.getByRole('region',{name:'Selected category information'})).toContainText('savings-interest-v1');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/registration-mobile.png'});
 await page.getByRole('button',{name:'Submit application'}).click();
 await expect(page.getByRole('heading',{name:'Application received'})).toBeVisible();
 const headers={Origin:'http://127.0.0.1:13000','X-Isave-Request':'1'};
 const body={first_name:'Changed',last_name:'Duplicate',email:'PUBLIC-APPLICANT@example.test'};
 const duplicate=await page.request.post('/api/registration',{headers,data:body});
 const known=await page.request.post('/api/registration',{headers,data:{...body,email:'browser-admin@example.test'}});
 expect(duplicate.status()).toBe(202);expect(known.status()).toBe(202);expect(await duplicate.json()).toEqual(await known.json());
 expect((await page.request.post('/api/registration',{headers:{...headers,Origin:'https://attacker.test'},data:body})).status()).toBe(403);
 expect(python(guard+`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; from app.models.user import User; from app.models.member import Member; from app.models.registration_fee import RegistrationFee; db=Session(engine); print(db.query(MembershipApplication).count(),db.query(User).count(),db.query(Member).count(),db.query(RegistrationFee).count())`).trim()).toBe('1 5 0 0');
 python(guard+`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; db=Session(engine); db.add_all([MembershipApplication(application_number='REVIEW-%02d'%i,first_name='Review',last_name='Fixture%02d'%i,email='review%02d@example.test'%i,status='Pending') for i in range(12)]);db.commit()`);
 for(const role of ['staff','admin']){
  await page.goto('/login',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Email address',{exact:true}).fill('browser-'+role+'@example.test');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/portal/${role}/dashboard$`));
  await page.goto(`/portal/${role}/registrations`,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('13 applications recorded')).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByLabel('Find an application').fill('NO-MATCH');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.getByText('No applications match your search')).toBeVisible();
  await page.getByLabel('Find an application').fill('PUBLIC-APPLICANT@EXAMPLE');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.getByText('1 application found')).toBeVisible();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await page.getByRole('button',{name:'View application for Public Synthetic'}).click();
  await expect(page.getByRole('heading',{name:'Status history'})).toBeVisible();
  await expect(page.getByText('Recorded information version: savings-interest-v1')).toBeVisible();
  await expect(page.getByText('Education',{exact:true})).toBeVisible();
  await expect(page.getByText('Public application submitted; awaiting office review.')).toBeVisible();
  await expect(page.getByRole('button',{name:/approve|activate|confirm payment/i})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/${role}-application-review-mobile.png`});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:`test-results/${role}-application-review-desktop.png`});
  await page.getByRole('button',{name:'Log out'}).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/review/applications')).status()).toBe(401);
 }
 expect(python(guard+`from sqlalchemy.orm import Session; from app.models.application import MembershipApplication; from app.models.member import Member; from app.models.registration_fee import RegistrationFee; db=Session(engine); a=db.query(MembershipApplication).filter_by(email='public-applicant@example.test').one(); print(a.status,a.member_id,db.query(Member).count(),db.query(RegistrationFee).count())`).trim()).toBe('Pending None 0 0');
});
