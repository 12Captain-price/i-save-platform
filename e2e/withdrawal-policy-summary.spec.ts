import {test,expect} from '@playwright/test';
const policy={withdrawal_mode:'full_or_partial',withdrawal_limits:'no_limits',withdrawal_methods:'cash_only',withdrawal_approval_levels:1,withdrawal_separation:'same_actor_allowed',withdrawal_cancellation:'before_processing_only',withdrawal_failure:'evidence_review_before_release',request_acknowledgement:'Exact TEST ONLY accepted request wording.',request_acknowledgement_version:'withdrawal-request-v1'};
for(const member of [false,true]){
 test(`readable paid policy and separate audit timestamps for ${member?'mobile member':'desktop Admin'}`,async({page})=>{
  if(member)await page.setViewportSize({width:390,height:844});
  const role=member?'member':'admin';
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(route.request().method()!=='GET')return route.abort();
   if(path==='/api/auth/me')return route.fulfill({json:{user:{id:424242,email:'policy-only@example.test',is_active:true,role_id:424242},workspace:role,permissions:[member?'withdrawals:own':'withdrawals:read']}});
   if(path==='/api/withdrawals/eligibility')return route.fulfill({json:{items:[{enrolment_id:3,currency:'USD',completion_date:'2025-09-30',eligible_by_date:true,can_request:false,blockers:['No unreserved confirmed savings are available for this enrolment'],earliest_possible_payout_at:null,settings_version:4,policy,notice:'TEST ONLY mock eligibility',confirmed:'0.00',reserved:'0.00',available:'0.00'}]}});
   if(path==='/api/withdrawals')return route.fulfill({json:{total:1,items:[{id:1,enrolment_id:3,amount:'10.00',currency:'USD',status:'Paid',completion_date:'2025-09-30',requested_at:'2026-10-08T22:47:43.976125Z',notice_ends_at:'2026-10-22T22:47:43.976125Z',settings_version:4,base_event_id:5,policy,payout:{amount:'10.00',currency:'USD',method:'manual_cash',payment_date:'2026-10-23',reference:'TEST-ONLY-PAYOUT',verified_at:'2026-10-22T23:06:00Z'},debit:{id:1,amount:'-10.00',withdrawal_id:1},receipt_available:true,notice:'TEST ONLY mock; no provider transfer',history:[{id:4,action:'record',status:'Recorded',reason:'TEST ONLY synthetic evidence',evidence_reference:'TEST-RECORD',actor:'policy-only@example.test',at:'2026-10-22T23:36:43.178370Z'},{id:5,action:'verify',status:'Paid',reason:'TEST ONLY verification',evidence_reference:'TEST-VERIFY',actor:'policy-only@example.test',at:'2026-10-22T23:43:38.100139Z'}]}]}});
   return route.abort();
  });
  await page.goto('/login');await page.waitForURL(`**/portal/${role}/dashboard`);
  if(member)await page.getByRole('button',{name:'Open portal menu'}).click();
  await page.getByRole('link',{name:'Withdrawals',exact:true}).click();
  if(member)await page.keyboard.press('Escape');
  const row=page.getByRole('article',{name:'Withdrawal 1',exact:true});
  await expect(row.getByText('Verified manual payout receipt')).toBeVisible();
  await expect(row.getByText(/^USD 10\.00 - Manual office cash -/)).toBeVisible();
  await expect(row.getByText(/Payout verification time:/)).toContainText('Harare');
  await row.getByText('Recorded policy and review history',{exact:true}).click();
  await expect(row.getByText('Full or partial amounts',{exact:true})).toBeVisible();
  await expect(row.getByText('Same employee with each permission (explicit approval required)')).toBeVisible();
  await expect(row.getByText('Exact TEST ONLY accepted request wording.')).toBeVisible();
  await expect(row.getByText(/record - Recorded - Audit recorded/)).toBeVisible();
  expect(await row.innerText()).not.toMatch(/withdrawal_mode|same_actor_allowed|manual_cash/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
