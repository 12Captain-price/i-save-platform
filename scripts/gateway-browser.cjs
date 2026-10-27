// Disposable gateway rehearsal only. Private inputs are never printed/traced.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const https=require('node:https'),http=require('node:http');
const {chromium}=require('@playwright/test');
const root=path.resolve('.gateway-private');
const config=JSON.parse(fs.readFileSync(path.join(root,'rehearsal.json')));
const environment=JSON.parse(fs.readFileSync(path.join(root,'staging-environment.json')));
if(!/^isave-gateway-hardening-\d+$/.test(config.project)||environment.STAGING_PROJECT!==config.project+'-tls')throw Error('Disposable identity required');
const env={...process.env,...environment},origin=environment.STAGING_PUBLIC_ORIGIN,host=new URL(origin).host;
const checks=[];let stage='start';
function check(name,passed){checks.push({check:name,passed});if(!passed)throw Error('Check failed');}
function get(route,headers={},secure=true){return new Promise((resolve,reject)=>{
 const req=(secure?https:http).get({host:'127.0.0.1',port:secure?13443:13081,path:route,rejectUnauthorized:false,headers:{host,...headers}},r=>{
  let body='';r.on('data',x=>body+=x);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body}));
 });req.on('error',reject);req.setTimeout(5000,()=>req.destroy());
});}
function compose(args,extra={}){
 const result=cp.spawnSync('docker',['compose','-f','compose.staging.yaml','-f',path.join(root,'tls-override.yaml'),...args],{env:{...env,...extra},encoding:'utf8'});
 if(result.status!==0)throw Error('Disposable Compose operation failed');
}
(async()=>{
 stage='redirect';let r=await get('/register?check=1',{host:'attacker.example.org'},false);
 check('HTTP redirect uses canonical HTTPS origin',r.status===308&&r.headers.location===origin+'/register?check=1');
 stage='spoof';r=await get('/api/public/availability',{'x-forwarded-proto':'http','x-forwarded-for':'not-an-ip','x-isave-gateway':'forged','x-isave-client-ip':'not-an-ip','x-isave-proto':'http'});
 check('gateway replaces spoofed client assertions',r.status===200);
 r=await get('/',{host:'attacker.example.org'});check('HTTPS gateway rejects noncanonical host',r.status===421);
 for(const mode of (process.argv.includes('--full-only')?['full']:['applications','full'])){
  stage=mode;compose(['up','-d','--no-deps','backend'],{STAGING_LAUNCH_MODE:mode});
  let ready=false;
  for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,500));try{r=await get('/api/public/availability');ready=r.status===200&&JSON.parse(r.body).mode===mode;if(ready)break;}catch{}}
  check(mode+' effective backend mode',ready);
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--host-resolver-rules=MAP staging.isave.example.org 127.0.0.1','--no-proxy-server']});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true}),page=await ctx.newPage();
   page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/')&&r.status()>=400)fs.appendFileSync(path.join(root,'browser-http-status.jsonl'),JSON.stringify({mode,path:u.pathname,status:r.status()})+'\n');});
   await page.goto(origin+'/register');await page.getByLabel('First name (required)').waitFor();check(mode+' registration form available',true);
   let status=await page.evaluate(async()=>{const r=await fetch('/api/registration',{method:'POST',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:'{}'});return r.status;});
   check(mode+' intake reaches validation without saving invalid data',status===400);
   await page.goto(origin+'/login');await page.getByLabel('Email address').fill('gateway-admin@example.test');await page.getByLabel('Password',{exact:true}).fill(config.browserPassword);
   await page.getByRole('button',{name:/log in|sign in/i}).click();await page.waitForURL('**/portal/admin/**');
   status=await page.evaluate(async()=>{const r=await fetch('/api/membership/applications/99999/approve',{method:'POST',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:'{}'});return r.status;});
   check(mode+' preserves launch/policy/validation boundaries',mode==='applications'?status===503:[400,404,409].includes(status));
   await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL('**/login');check(mode+' logout completes',true);
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(root,'browser-modes.json'),JSON.stringify(checks));console.log(JSON.stringify(checks));
})().catch(()=>{console.log(JSON.stringify({failed_stage:stage,completed_checks:checks}));process.exitCode=1;});
