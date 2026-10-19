import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const email='experience-retry@example.test';
function recordCount(){
 return execFileSync('docker',['compose','-p','isave-browser-auth','-f','compose.auth-test.yaml','exec','-T','backend','python','-c',`from app.database import engine; assert engine.url.database=='isave_test_browser'; from sqlalchemy.orm import Session; from app.models.application import MembershipApplication,ApplicationEvent; db=Session(engine); a=db.query(MembershipApplication).filter_by(email='${email}').all(); print(len(a),db.query(ApplicationEvent).filter(ApplicationEvent.application_id.in_([v.id for v in a])).count())`],{encoding:'utf8',windowsHide:true}).trim();
}
test('mobile keyboard submission, lost response, safe retry and identical duplicate confirmation',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 const fill=async()=>{
  await page.goto('/register',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Need help registering?'})).toBeVisible();
  await page.getByRole('radio',{name:'Asset',exact:true}).focus();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('radio',{name:'Holiday',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByLabel('First name (required)').focus();
  await page.keyboard.type('Experience');await page.keyboard.press('Tab');
  await expect(page.getByLabel('Last name (required)')).toBeFocused();await page.keyboard.type('Synthetic');
  await page.keyboard.press('Tab');await expect(page.getByLabel('Email address (required)')).toBeFocused();await page.keyboard.type(email);
  await page.keyboard.press('Tab');await expect(page.getByLabel('Phone (optional)')).toBeFocused();await page.keyboard.type('+27000123456');
  await page.keyboard.press('Tab');await page.keyboard.type('Synthetic address');
  await page.keyboard.press('Tab');await page.keyboard.type('Keep my entered details');
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Submit application'})).toBeFocused();
 };
 await fill();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.route('**/api/registration',async route=>{
  // The server commits, but the browser loses the response: retry must not duplicate.
  const response=await route.fetch();expect(response.status()).toBe(202);await route.abort('failed');
 },{times:1});
 await page.keyboard.press('Enter');
 await expect(page.getByRole('alert')).toBeFocused();
 await expect(page.getByLabel('Email address (required)')).toHaveValue(email);
 await expect(page.getByLabel('Reason for applying (optional)')).toHaveValue('Keep my entered details');
 await expect(page.getByRole('heading',{name:'Application received'})).toHaveCount(0);
 expect(recordCount()).toBe('1 1');
 await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Retry submission'})).toBeFocused();await page.keyboard.press('Enter');
 const status=page.getByRole('status',{name:'Application received'});
 await expect(status).toBeFocused();
 await expect(page.locator('form')).toHaveCount(0);
 const acknowledgement=await status.innerText();
 await expect(status).toContainText('Your application is awaiting review. This does not mean your membership has been approved.');
 await expect(status.locator('ol li')).toHaveCount(3);
 await expect(page.getByRole('complementary',{name:'Application follow-up'})).toContainText('Yolk House');
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'+263 29 226 1341'})).toBeFocused();
 await page.screenshot({path:'test-results/registration-confirmation-mobile.png',fullPage:true});
 await fill();await page.keyboard.press('Enter');await expect(status).toBeFocused();
 expect(await status.innerText()).toBe(acknowledgement);expect(recordCount()).toBe('1 1');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/registration-confirmation-desktop.png',fullPage:true});
});
test('public Contact uses approved links and offers no simulated message delivery',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/contact',{waitUntil:'domcontentloaded'});
 for(const [name,href] of [['+263 29 226 1341','tel:+263292261341'],['+263 78 552 1029','tel:+263785521029'],['+263 78 663 9536','tel:+263786639536'],['zpyfinfo@gmail.com','mailto:zpyfinfo@gmail.com']]){
  await expect(page.getByRole('link',{name,exact:true})).toHaveAttribute('href',href);
 }
 await expect(page.getByText('5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe',{exact:true})).toBeVisible();
 await expect(page.locator('form')).toHaveCount(0);
 expect(await page.locator('body').innerText()).not.toMatch(/WhatsApp|office hours|info@isave|123 4567|Harare/i);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
