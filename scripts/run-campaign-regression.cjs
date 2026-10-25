// Preserve pytest's exit status; never print raw failure bodies/tokens/headers.
const {spawn}=require('node:child_process'),fs=require('node:fs');
const args=['exec','-e','CAMPAIGN_DELIVERY_ENABLED=false','-e','INVITATION_DELIVERY=disabled','isave-campaigns-rehearsal-20261025-backend-1','python','-m','pytest','-q','--tb=short'];
const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
let lastProgress=0;
child.stdout.on('data',d=>{const chunk=d.toString();output+=chunk;for(const m of chunk.matchAll(/\[\s*(\d+)%\]/g)){const n=Number(m[1]);if(n>lastProgress){lastProgress=n;console.log('Backend regression progress: '+n+'%');}}});child.stderr.on('data',d=>{output+=d.toString();});
child.on('error',()=>{console.error('Regression command could not start.');process.exitCode=1;});
child.on('close',(code,signal)=>{const counts={};for(const label of ['passed','failed','skipped','errors']){const matches=[...output.matchAll(new RegExp('(\\d+) '+label,'g'))];counts[label]=matches.length?Number(matches.at(-1)[1]):0;}const failures=[...new Set([...output.matchAll(/FAILED (tests\/[a-z_0-9.]+::[a-z_0-9_]+)/g)].map(m=>m[1]))];const report={...counts,exit_status:code??1,signal:signal??null,command:['docker',...args].join(' '),failures};fs.mkdirSync('docs/announcement-campaigns',{recursive:true});fs.writeFileSync('docs/announcement-campaigns/backend.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=code??1;});
