// Capture raw pytest output privately in memory; expose only counts/test names.
const {spawn}=require('node:child_process'),fs=require('node:fs');
const phase=process.argv[2]||'backend';
if(!/^[a-z-]+$/.test(phase))process.exit(2);
const tests=process.argv.slice(3);
const args=['exec','-e','CAMPAIGN_DELIVERY_ENABLED=false','-e','INVITATION_DELIVERY=disabled','isave-operations-rehearsal-20261025-backend-1','python','-m','pytest','-q','--tb=short',...tests];
const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',progress=0;
child.stdout.on('data',d=>{output+=d.toString();for(const m of d.toString().matchAll(/\[\s*(\d+)%\]/g)){const n=Number(m[1]);if(n>progress){progress=n;console.log('Regression progress: '+n+'%');}}});child.stderr.on('data',d=>output+=d.toString());
child.on('error',()=>{console.error('Regression command failed to start');process.exitCode=1;});
child.on('close',(code,signal)=>{const result={};for(const label of ['passed','failed','skipped','errors']){const matches=[...output.matchAll(new RegExp('(\\d+) '+label,'g'))];result[label]=matches.length?Number(matches.at(-1)[1]):0;}result.exit_status=code??1;result.signal=signal??null;result.command=['docker',...args].join(' ');result.failures=[...new Set([...output.matchAll(/FAILED (tests\/[a-z_0-9.]+::[a-z_0-9_]+)/g)].map(m=>m[1]))];
 // Only safe stack locations/types aid diagnosis; never persist captured bodies.
 result.error_locations=output.split('\n').filter(l=>/^tests\/.*:\d+:/.test(l)).map(l=>l.split(':').slice(0,3).join(':'));
 fs.mkdirSync('docs/private-document-operations',{recursive:true});fs.writeFileSync('docs/private-document-operations/'+phase+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=code??1;});
