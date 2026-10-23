// Only this completed disposable rehearsal. Archives stay outside Git. No raw
// tokens, session hashes, account rows or dump contents are printed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const project='isave-withdrawal-rehearsal',dbContainer=project+'-db-1';
const compose=['compose','-p',project,'-f','compose.auth-test.yaml','-f','compose.withdrawal-test.yaml'];
const run=(args,input,encoding='utf8')=>execFileSync('docker',args,{input,encoding,stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:64*1024*1024});
const reportPath='docs/withdrawals/closure.json';
if(fs.existsSync(reportPath)&&JSON.parse(fs.readFileSync(reportPath,'utf8')).completed){console.log('Rehearsal closure already complete; no command run.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
const recovery='isave-withdrawal-final-restore-'+stamp;
const report={started_at:new Date().toISOString(),client_date:'2026-10-23',checks:[],completed:false};
let archiveReady=false,recoveryStarted=false,writersStopped=false;
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error('Guard failed');console.log('PASS: '+name);}
const normalNames=['frontend','backend','db','mailpit'].map(s=>'i-saveprototype-main-'+s+'-1');
const normalState=()=>normalNames.map(n=>run(['inspect','--format','{{.Id}}|{{.State.StartedAt}}|{{.State.Running}}|{{.State.Health.Status}}',n]).trim());
const snapshot=`
import json,hashlib
from sqlalchemy import text
from app.database import engine
assert engine.url.database in {'isave_test_browser','isave_test_withdrawal_final'}
result={'tables':{},'sequences':{}}
with engine.connect() as c:
 c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
 c.execute(text("SET TIME ZONE 'UTC'"))
 assert c.execute(text('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP')).scalar()==0
 for name in c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).scalars():
  quoted=c.dialect.identifier_preparer.quote(name)
  rows=sorted(c.execute(text('SELECT row_to_json(t)::text FROM '+quoted+' t')).scalars())
  columns=[list(r) for r in c.execute(text("SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND t.relname=:name AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum"),{'name':name})]
  constraints=sorted(c.execute(text("SELECT pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=:name"),{'name':name}).scalars())
  indexes=sorted(c.execute(text("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=:name"),{'name':name}).scalars())
  triggers=sorted(c.execute(text("SELECT pg_get_triggerdef(g.oid) FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=:name AND NOT g.tgisinternal"),{'name':name}).scalars())
  result['tables'][name]={'rows':len(rows),'sha256':hashlib.sha256('\\n'.join(rows).encode()).hexdigest(),'structure':hashlib.sha256(json.dumps([columns,constraints,indexes,triggers],sort_keys=True).encode()).hexdigest()}
 for n,v in c.execute(text("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")):result['sequences'][n]=v
print(json.dumps(result,sort_keys=True))
`;
function snapshotAt(container,database){return JSON.parse(run(['run','--rm','--network','container:'+container,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/'+database,'--entrypoint','python','isave-withdrawal-test-backend','-c',snapshot]));}
(async()=>{try{
 const normalBefore=normalState();
 const containers=JSON.parse(run(['inspect',project+'-frontend-1',project+'-backend-1',dbContainer]));
 check('only exact disposable Compose targets selected',containers.every(c=>c.Config.Labels['com.docker.compose.project']===project&&Object.keys(c.NetworkSettings.Networks).every(n=>n===project+'_default')));
 const checkpoint=fs.readFileSync(path.join(process.env.USERPROFILE,'isave-backups','withdrawal-rehearsal-20261023','private-checkpoint.json'),'utf8');
 const final=JSON.parse(run(['exec','-i',project+'-backend-1','python','-c',`
import json,sys,hashlib
from sqlalchemy.orm import Session
from app.withdrawal_rehearsal import guard,clock
from app.database import engine
from app.models.auth import AuthSession
from app.models.withdrawal import WithdrawalRequest,WithdrawalPayout,WithdrawalDebit,WithdrawalEvent
from app.models.audit_event import AuditEvent
from app.security.auth import now,aware,validate_session
from app.exceptions import APIError
from app.services.withdrawals import funds,present
from app.services.savings import summary
from app.services.financial_reports import records
from datetime import date
from zoneinfo import ZoneInfo
guard();old=json.load(sys.stdin)
with Session(engine) as db:
 sessions=db.query(AuthSession).all();rejected=0
 for s in sessions:
  try:validate_session(s)
  except APIError as e:assert e.status_code==401;rejected+=1
 assert rejected==len(sessions)
 latest=max((s for s in sessions if s.revoked_at),key=lambda s:aware(s.revoked_at))
 logout=db.query(AuditEvent).filter_by(action='logout').order_by(AuditEvent.created_at.desc()).first()
 assert logout and logout.actor_user_id==latest.user_id and abs((aware(logout.created_at)-aware(latest.revoked_at)).total_seconds())<5
 r=db.query(WithdrawalRequest).one();p=db.query(WithdrawalPayout).one();d=db.query(WithdrawalDebit).one();events=db.query(WithdrawalEvent).order_by(WithdrawalEvent.id).all()
 assert db.query(WithdrawalPayout).count()==db.query(WithdrawalDebit).count()==1 and r.status=='Paid'
 assert d.withdrawal_id==p.withdrawal_id==r.id and d.member_id==r.member_id and d.enrolment_id==r.enrolment_id and d.amount==-p.amount and d.currency==p.currency=='USD'
 assert [e.action for e in events]==['request','approve','process','record','verify'] and d.event_id==events[-1].id
 assert aware(latest.revoked_at)>=aware(events[-1].recorded_at)
 f=funds(db,r.enrolment_id);m=summary(db,r.member_id);report=records(db,date(2026,10,1),date(2026,10,31))
 assert f=={'confirmed':'0.00','reserved':'0.00','available':'0.00'} and m['confirmed']==[{'currency':'USD','amount':'0.00'}] and m['reserved']==[]
 assert report['net_ledger_movement']==[{'currency':'USD','amount':'0.00'}]
 assert [x['amount'] for x in report['items'] if x['category']=='withdrawal_debits']==['-10.00'] and not any(x['category']=='withdrawal_reservations' for x in report['items'])
 assert clock().isoformat()=='2026-10-22T23:06:00+00:00' and p.verified_at==clock() and p.payment_at==clock()
 fields={c.name:str(getattr(r,c.name)) for c in r.__table__.columns if c.name!='status'}
 assert hashlib.sha256(json.dumps(fields,sort_keys=True).encode()).hexdigest()==old['request_immutable_sha256'] and hashlib.sha256(r.terms_snapshot.encode()).hexdigest()==old['terms_sha256']
 z=ZoneInfo('Africa/Harare')
 print(json.dumps({'status':r.status,'payouts':1,'debits':1,'debit_amount':str(d.amount),'currency':d.currency,'funds':f,'member_balance':'0.00','report_totals':report['totals'],'report_net':report['net_ledger_movement'],'receipt_available':present(db,r)['receipt_available'],'history':[e.action for e in events],'clock_unchanged':True,'request_and_terms_preserved':True,'sessions_rejected401':rejected,'sessions_revoked':sum(bool(s.revoked_at) for s in sessions),'older_expired_unrevoked':sum(not s.revoked_at and aware(s.expires_at)<=now() for s in sessions),'active_sessions':0,'latest_logout_revoked_and_audited':True,'verification_clock_harare':p.verified_at.astimezone(z).isoformat(),'record_audit_harare':p.recorded_at.astimezone(z).isoformat(),'verification_audit_harare':events[-1].recorded_at.astimezone(z).isoformat()}))
`],checkpoint));
 report.server=final;check('latest logout revoked and audited; all sessions rejected401',final.latest_logout_revoked_and_audited&&final.active_sessions===0);
 check('single linked payout/debit, zero reservation and report/member agreement',final.payouts===1&&final.debits===1&&final.funds.reserved==='0.00');
 const directory=path.join(process.env.USERPROFILE,'isave-backups','withdrawal-rehearsal-final-'+stamp);
 fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 run(['cp',project+'-backend-1:/tmp/withdrawal-test-clock.json',path.join(directory,'scenario-clock.json')]);
 run([...compose,'stop','frontend','backend']);writersStopped=true;
 const before=snapshotAt(dbContainer,'isave_test_browser');
 const dump=run(['exec',dbContainer,'pg_dump','-U','postgres','-d','isave_test_browser','-Fc','--no-owner'],undefined,null);
 check('private custom-format rehearsal archive captured',dump.subarray(0,5).toString()==='PGDMP');
 const archive=path.join(directory,'rehearsal.dump');fs.writeFileSync(archive,dump);
 const sha=crypto.createHash('sha256').update(dump).digest('hex');
 check('saved archive byte fingerprint matches',crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')===sha);
 fs.writeFileSync(path.join(directory,'source-fingerprints.json'),JSON.stringify(before,null,2));
 fs.writeFileSync(path.join(directory,'server-check.json'),JSON.stringify(final,null,2));
 report.archive={path:archive,bytes:dump.length,sha256:sha,acl:'current Windows user and SYSTEM'};
 run(['run','-d','--name',recovery,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_DB=isave_test_withdrawal_final','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);recoveryStarted=true;
 for(let i=0;i<30;i++){try{run(['exec',recovery,'pg_isready','-U','postgres','-d','isave_test_withdrawal_final']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 run(['cp',archive,recovery+':/tmp/private-rehearsal.dump']);
 run(['exec',recovery,'pg_restore','-U','postgres','-d','isave_test_withdrawal_final','--no-owner','--exit-on-error','/tmp/private-rehearsal.dump']);
 const restored=snapshotAt(recovery,'isave_test_withdrawal_final');
 check('independent archive restore preserves rows, schema, triggers and sequences',JSON.stringify(before)===JSON.stringify(restored));
 fs.writeFileSync(path.join(directory,'restored-fingerprints.json'),JSON.stringify(restored,null,2));
 archiveReady=true;
 run([...compose,'stop','db']);
 check('only disposable rehearsal services stopped',JSON.parse(run(['inspect',project+'-frontend-1',project+'-backend-1',dbContainer])).every(c=>!c.State.Running&&c.State.ExitCode===0));
 check('normal service IDs/start times/health unchanged',JSON.stringify(normalBefore)===JSON.stringify(normalState()));
 report.completed=true;report.finished_at=new Date().toISOString();
 console.log('PASS: verified private restore, rehearsal stopped, normal services unchanged; no volumes deleted.');
}catch{
 report.failure='Closure stopped at a guard; no credentials or private database errors printed.';
 report.archive_verified=archiveReady;report.rehearsal_writers_stopped=writersStopped;
 console.error(report.failure);process.exitCode=1;
}finally{
 if(recoveryStarted){try{run(['stop',recovery]);}catch{report.recovery_stop_failed=true;process.exitCode=1;}}
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}})();
