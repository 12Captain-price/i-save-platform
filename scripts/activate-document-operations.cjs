// Controlled local activation. Capture secrets in memory; never print raw errors.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project='i-saveprototype-main',compose=['compose','-p',project,'-f','compose.yaml','-f','compose.mailpit.yaml','-f','compose.operations.yaml'];
const evidence='docs/private-document-operations';const report={checks:[],completed:false};let env={...process.env},writersStopped=false,restoreName;
const run=(a,input,encoding='utf8')=>execFileSync('docker',a,{input,encoding,env,stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:192*1024*1024});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(name,value){report.checks.push({check:name,passed:!!value});if(!value)throw Error('Checkpoint');console.log('PASS: '+name);}
const snapshot=require('./withdrawal-snapshot.cjs').replace('print(json.dumps(result,sort_keys=True))',`with engine.connect() as c:
 result['catalog']=[list(r) for r in c.execute(text('select id,code from permissions order by id'))]
 result['grants']=[list(r) for r in c.execute(text('select role_id,permission_id from role_permissions order by role_id,permission_id'))]
 result['roles']=[list(r) for r in c.execute(text('select id,name from roles order by id'))]
print(json.dumps(result,sort_keys=True))`);
const added=['operations_policies','operations_events','backup_jobs'],codes=['operations:read','retention:draft','retention:publish','retention:hold','retention:execute','backups:run','backups:restore-test'];
function retained(a,b){return Object.entries(a.tables).every(([t,v])=>['permissions','role_permissions'].includes(t)?v.structure_sha256===b.tables[t]?.structure_sha256:equal(v,b.tables[t]))&&Object.entries(a.sequences).every(([s,v])=>s==='permissions_id_seq'||v===b.sequences[s])&&a.catalog.every(r=>b.catalog.some(n=>equal(r,n)))&&a.grants.every(r=>b.grants.some(n=>equal(r,n)))&&b.catalog.filter(r=>!a.catalog.some(n=>n[0]===r[0])).every(r=>codes.includes(r[1]))&&b.grants.filter(r=>!a.grants.some(n=>equal(n,r))).every(r=>codes.includes(b.catalog.find(c=>c[0]===r[1])?.[1])&&b.roles.find(n=>n[0]===r[0])?.[1]==='administrator');}
const stable=()=>JSON.parse(run(['inspect',project+'-db-1',project+'-mailpit-1'])).map(c=>({id:c.Id,running:c.State.Running,started:c.State.StartedAt}));
(async()=>{try{
 const full=JSON.parse(fs.readFileSync(evidence+'/backend-full.json')),affected=JSON.parse(fs.readFileSync(evidence+'/backend-affected-final.json')),front=JSON.parse(fs.readFileSync(evidence+'/frontend.json')),browser=JSON.parse(fs.readFileSync(evidence+'/browser.json')),worker=JSON.parse(fs.readFileSync(evidence+'/worker.json')),persistence=JSON.parse(fs.readFileSync(evidence+'/persistence.json'));
 check('full and affected regression/browser/worker/persistence gates passed',full.exit_status===0&&affected.exit_status===0&&front.success&&browser.completed&&browser.failed===0&&worker.completed&&persistence.completed);
 const preserved=stable(),old=JSON.parse(run(['inspect',project+'-backend-1',project+'-frontend-1']));
 const current=Object.fromEntries(old[0].Config.Env.map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
 check('normal database target and synthetic scanner disabled',new URL(current.DATABASE_URL.replace('postgresql+psycopg:','postgresql:')).pathname==='/isave'&&current.APP_ENV!=='test'&&current.DOCUMENT_SCAN_TEST_ONLY!=='true');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').toLowerCase();
 const directory=path.join(process.env.USERPROFILE,'isave-backups','operations-normal-'+stamp);fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 const key=path.join(directory,'backup.key'),passwordFile=path.join(directory,'restore.password');fs.writeFileSync(key,crypto.randomBytes(32));const password=crypto.randomBytes(36).toString('hex');fs.writeFileSync(passwordFile,password);
 const preservedConfiguration=Object.fromEntries(Object.entries(current).filter(([k])=>['DATABASE_URL','APP_ENV','APP_DEBUG','SECRET_KEY','CORS_ORIGINS','PASSWORD_SETUP_EXPIRE_MINUTES','SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_TIMEOUT_SECONDS','PASSWORD_SETUP_FRONTEND_URL'].includes(k)));
 env={...process.env,...preservedConfiguration,BACKUP_KEY_FILE_HOST:key,RESTORE_PASSWORD_FILE_HOST:passwordFile,RESTORE_TEST_URL:'postgresql+psycopg://recovery_operator:'+password+'@restore-db:5432/postgres'};
 const configuration=JSON.parse(run([...compose,'config','--format','json']));
 check('private scanner and restore target have no published ports or normal database storage',!configuration.services.scanner.ports&&!configuration.services['restore-db'].ports&&configuration.services['restore-db'].volumes.every(v=>v.source!=='pg_data')&&configuration.volumes.restore_pg.name!=='i_save_postgres_data');
 old.forEach((c,i)=>run(['image','tag',c.Image,'isave-'+(i?'frontend':'backend')+'-rollback:pre-operations-'+stamp]));report.rollback=old.map(c=>({name:c.Name,image:c.Image}));
 run([...compose,'build','backend','frontend','account-worker','operations-worker']);
 check('normal backend/frontend/worker production builds passed',true);
 run([...compose,'stop','frontend','account-worker','backend']);writersStopped=true;
 const normal=code=>run([...compose,'run','--rm','--no-deps','--entrypoint','python','backend','-c',"from app.database import engine; assert engine.url.database=='isave' and engine.url.host=='db';\n"+code]);
 const before=JSON.parse(normal(snapshot));check('normal revision17 before activation',before.revision==='0017_campaigns');fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(before));
 // Use PG16 tools with only the normal source network; plaintext stays in tmpfs.
 const image=JSON.parse(run(['image','inspect','i-saveprototype-main-operations-worker']))[0].Id;
 const network=old[0].NetworkSettings.Networks[project+'_default']?project+'_default':Object.keys(old[0].NetworkSettings.Networks).find(n=>n.endsWith('_default'));
 check('documented normal source network selected',!!network);
 const backup=JSON.parse(run(['run','--rm','--network',network,'--mount','type=bind,source='+directory+',target=/private','--mount','type=bind,source='+key+',target=/run/secrets/backup_key,readonly','-e','DATABASE_URL','-e','BACKUP_DIRECTORY=/private',image,'python','-c',"from app.services.backups import create_backup; import json; checksum,size=create_backup(0);print(json.dumps({'checksum':checksum,'bytes':size}))"]));
 const encrypted=fs.readFileSync(path.join(directory,'backup-0.isave'));check('encrypted private pre-migration archive checksum matches',backup.bytes===encrypted.length&&backup.checksum===crypto.createHash('sha256').update(encrypted).digest('hex'));
 // Header length is derived, never guessed: magic includes a terminal NUL.
 const magic=Buffer.from('ISAVE-BACKUP-1\0'),start=magic.length;const decipher=crypto.createDecipheriv('aes-256-gcm',fs.readFileSync(key),encrypted.subarray(start,start+12));decipher.setAAD(magic);decipher.setAuthTag(encrypted.subarray(-16));const plain=Buffer.concat([decipher.update(encrypted.subarray(start+12,-16)),decipher.final()]);const length=plain.readUInt32BE(0),manifest=JSON.parse(plain.subarray(4,4+length)),dump=plain.subarray(4+length);
 check('authenticated manifest and dump checksum verified',manifest.dump_sha256===crypto.createHash('sha256').update(dump).digest('hex'));
 restoreName='isave-operations-restore-'+stamp;run(['run','-d','--name',restoreName,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=isave_restore_pre18','-v',restoreName+'-pg:/var/lib/postgresql/data','postgres:16-alpine']);
 for(let n=0;n<40;n++){try{run(['exec',restoreName,'pg_isready','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 run(['exec','-i',restoreName,'pg_restore','-U','postgres','-d','isave_restore_pre18','--no-owner','--no-acl','--exit-on-error'],dump);
 // Copy database tools/code into this isolated container from the built image
 // through a one-off application container sharing only its network namespace.
 const restored=code=>run(['run','--rm','--network','container:'+restoreName,'-e','DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/isave_restore_pre18',image,'python','-c',code]);
 const baseline=JSON.parse(restored(snapshot));check('independent restore retains every original row, document and schema',equal(before.tables,baseline.tables)&&equal(before.sequences,baseline.sequences));
 const upgrade="from app.migrations import upgrade,require_current_schema;upgrade(engine);require_current_schema(engine)";
 restored('from app.database import engine;'+upgrade);const rehearsed=JSON.parse(restored(snapshot));check('restored upgrade preserves original data and grants',rehearsed.revision==='0018_operations'&&retained(before,rehearsed));
 normal(upgrade);const after=JSON.parse(normal(snapshot));check('normal migration18 preserves original records, documents and grants',after.revision==='0018_operations'&&retained(before,after));
 check('only three empty operational tables added with no published policy',equal(Object.keys(after.tables).filter(k=>!before.tables[k]).sort(),[...added].sort())&&added.every(t=>after.tables[t].rows===0));
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after));
 normal("from app.services.operations import active,preview;from sqlalchemy.orm import Session;from app.config import get_settings;db=Session(engine);assert active(db)[0]==0 and not preview(db)['execution_available'] and not get_settings().campaign_delivery_enabled;print('blocked')");check('normal retention execution and campaign sending remain disabled',true);
 run([...compose,'up','-d','--no-deps','--no-build','scanner','restore-db']);
 run([...compose,'up','-d','--no-deps','--no-build','backend','frontend','account-worker','operations-worker']);writersStopped=false;
 check('normal PostgreSQL and existing Mailpit states/start times preserved',equal(preserved,stable()));
 run(['stop',restoreName]);report.private_preservation={directory,encrypted_backup_bytes:backup.bytes,encrypted_sha256:backup.checksum,independent_restore:true,original_documents:before.tables.application_evidence.rows};
 report.key_configuration={backup_key_file_host:key,restore_password_file_host:passwordFile,restore_url_printed:false};
 fs.writeFileSync(path.join(directory,'configuration.json'),JSON.stringify({backup_key_file_host:key,restore_password_file_host:passwordFile},null,2));
 report.migration='0018_operations';report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check||'Private activation checkpoint failed; inspect safe service status before retrying';report.writers_stopped=writersStopped;process.exitCode=1;console.error(report.failure);}finally{fs.writeFileSync(evidence+'/activation.json',JSON.stringify(report,null,2)+'\n');}})();
