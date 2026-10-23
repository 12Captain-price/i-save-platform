import {test,expect} from '@playwright/test';

// Browser-only synthetic responses: every API request is intercepted. No account,
// authentication session, clock or financial record is created or modified.
for(const timezoneId of ['UTC','Africa/Harare','America/New_York']){
 test(`explicit Harare payout is identical in ${timezoneId}; rejection preserves fields`,async({browser})=>{
  const context=await browser.newContext({timezoneId,baseURL:process.env.ISAVE_E2E_ORIGIN??'http://127.0.0.1:13050'});
  const page=await context.newPage();let submitted:Record<string,unknown>|undefined;
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path==='/api/auth/me')return route.fulfill({json:{user:{id:424242,email:'timezone-only@example.test',is_active:true,role_id:424242},workspace:'admin',permissions:['withdrawals:read','withdrawals:process']}});
   if(path==='/api/withdrawals'&&request.method()==='GET')return route.fulfill({json:{total:1,items:[{id:1,enrolment_id:3,amount:'10.00',currency:'USD',status:'Processing',completion_date:'2025-09-30',requested_at:'2026-10-08T22:47:43.976125Z',notice_ends_at:'2026-10-22T22:47:43.976125Z',settings_version:4,base_event_id:3,policy:{withdrawal_methods:'cash_only'},history:[],payout:null,debit:null,receipt_available:false,notice:'TEST ONLY mock; no transfer'}]}});
   if(path==='/api/withdrawals/1/record'&&request.method()==='POST'){
    submitted=request.postDataJSON();return route.fulfill({status:400,json:{error:'TEST ONLY rejection: no record was written'}});
   }
   return route.abort();
  });
  try{
   // Enter through the public login shell: its mocked identity navigates on the
   // client. A direct protected-document request correctly requires server auth.
   await page.goto('/login');await page.waitForURL('**/portal/admin/dashboard');
   await page.getByRole('link',{name:'Withdrawals',exact:true}).click();
   const legacy=await page.evaluate(()=>({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,parsed:new Date('2026-10-23T01:06').toISOString()}));
   const afterNotice=Date.parse(legacy.parsed)>=Date.parse('2026-10-22T22:47:43.976125Z');
   const notFuture=Date.parse(legacy.parsed)<=Date.parse('2026-10-22T23:06:00Z');
   expect(afterNotice).toBe(true);expect(notFuture).toBe(timezoneId==='Africa/Harare');
   const row=page.getByRole('article',{name:'Withdrawal 1',exact:true});
   await row.getByRole('combobox',{name:/^Action/}).selectOption('record');
   await row.getByLabel('Reason',{exact:true}).fill('TEST ONLY timezone validation');
   await row.getByLabel('Review evidence/reference').fill('TEST-TIMEZONE');
   await row.getByLabel('Manual payout method').selectOption('manual_cash');
   await row.getByLabel('Actual payout date and time (Harare, UTC+02:00)').fill('2026-10-23T01:06');
   await row.getByLabel('Harare payment date').fill('2026-10-23');
   await row.getByLabel('Unique actual payment reference').fill('TEST-ONLY-TIMEZONE');
   await row.getByRole('checkbox').check();await row.getByRole('button',{name:'Record withdrawal action'}).click();
   await expect(page.getByRole('alert')).toHaveText('TEST ONLY rejection: no record was written');
   expect(submitted?.['payment_at']).toBe('2026-10-22T23:06:00.000Z');
   expect(submitted?.['payment_date']).toBe('2026-10-23');
   await expect(row.getByLabel('Actual payout date and time (Harare, UTC+02:00)')).toHaveValue('2026-10-23T01:06');
   await expect(row.getByLabel('Unique actual payment reference')).toHaveValue('TEST-ONLY-TIMEZONE');
   await expect(page.getByText('Verified manual payout receipt')).toHaveCount(0);
  }finally{await context.close();}
 });
}
