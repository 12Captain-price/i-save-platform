// Private synthetic credentials remain in pipe memory; never log extracted SQL.
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});
try{
 const source=path.join(process.env.USERPROFILE,'isave-backups','savings-rehearsal-final-20261022','rehearsal.dump');
 run(['cp',source,'isave-recurring-rehearsal-db-1:/tmp/private-synthetic-source.dump']);
 const sql=run(['exec','isave-recurring-rehearsal-db-1','pg_restore','-a','-t','users','-f','-','/tmp/private-synthetic-source.dump']);
 const match=sql.match(/COPY public\.users \(([^)]+)\) FROM stdin;\r?\n([\s\S]*?)\n\\\./);
 if(!match)throw Error();
 const columns=match[1].split(',').map(s=>s.trim());
 const rows=match[2].trim().split('\n').map(line=>Object.fromEntries(line.trim().split('\t').map((v,i)=>[columns[i],v])));
 const data={};
 for(const [key,email]of [['admin','savings-admin@example.test'],['member','savings-member@example.test']]){
  const row=rows.find(r=>r.email===email);if(!row)throw Error();
  data[key]={email:row.email,password_hash:row.password_hash};
 }
 const output=run(['exec','-i','isave-recurring-rehearsal-backend-1','python','-m','app.recurring_rehearsal'],JSON.stringify(data));
 if(!output.startsWith('PASS:'))throw Error();
 console.log('PASS: two private reusable synthetic logins and fresh recurring scenario prepared; source backup and normal database untouched');
}catch{
 console.error('Private rehearsal preparation refused; no credentials printed. Check guarded target, source archive and empty fixture state. No reset attempted.');
 process.exitCode=1;
}
