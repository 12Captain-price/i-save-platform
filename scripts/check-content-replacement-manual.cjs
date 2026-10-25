// Pre-logout verification. Session hash identifiers go only to an ACL-private checkpoint.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const project='isave-content-replacement-20261025',database='isave_test_content_replacement_20261025';
const evidence='docs/content-support/replacement-20261025';
const report={project,database,checks:[],operator_confirmations:{private_draft_preview:true,public_version_excludes_draft:true,one_office_reply_saved:true,member_reply_visible:true},completed:false};
const run=(a,input)=>execFileSync('docker',a,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:64*1024*1024});
function check(name,v){report.checks.push({check:name,passed:!!v});if(!v)throw Error(name);console.log('PASS: '+name);}
(async()=>{try{
 const result=JSON.parse(run(['exec','-i',project+'-backend-1','python','-'],`import json,hashlib
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import engine
from app.models.user import User
from app.models.auth import AuthSession
from app.models.account_workflows import AccountLink,Notification
from app.models.content_support import ContentVersion,ContentEvent,SupportTicket,TicketMessage,TicketEvent
from app.models.audit_event import AuditEvent
from app.services.content_support import public_items,ticket_present
from app.security.auth import now,aware
assert engine.url.host=='db' and engine.url.database=='${database}'
with Session(engine) as db:
 admin=db.query(User).filter_by(email='accounts-admin@example.test').one();member=db.query(User).filter_by(email='accounts-member@example.test').one()
 assert db.query(User).count()==2
 ticket=db.query(SupportTicket).one();messages=db.query(TicketMessage).filter_by(ticket_id=ticket.id).order_by(TicketMessage.id).all()
 assert ticket.user_id==member.id and ticket.status=='Open' and len(messages)==3
 assert messages[0].actor_id==member.id and messages[1].actor_id==admin.id and messages[2].actor_id==member.id and not any(m.internal for m in messages)
 assert messages[1].body.rstrip('.')=='TEST ONLY office reply: your synthetic support question has been reviewed'
 reply=db.query(TicketEvent).filter_by(ticket_id=ticket.id,action='reply',actor_id=admin.id).one()
 followup=db.query(TicketEvent).filter_by(ticket_id=ticket.id,action='reply',actor_id=member.id).one();assert followup.request_key!=reply.request_key
 audit=db.query(AuditEvent).filter_by(action='support_reply',target_table='support_tickets',target_id=str(ticket.id),actor_user_id=admin.id).one()
 assert db.query(Notification).filter_by(user_id=member.id,event_key=str(member.id)+':ticket-event:'+str(reply.id)).count()==1
 view=ticket_present(db,member,ticket);assert len(view['messages'])==3 and 'accounts-admin@example.test' not in json.dumps(view,default=str)
 public=public_items(db,'announcement');assert len(public)==1 and public[0]['version']==1 and 'UNPUBLISHED' not in json.dumps(public,default=str)
 assert db.query(ContentVersion).count()==2 and db.query(ContentEvent).count()==3
 links=db.query(AccountLink).all();assert len(links)==4 and all(l.purpose=='recovery' for l in links) and sum(l.consumed_at is not None for l in links)==2 and all(l.consumed_at or l.revoked_at for l in links)
 admin_sessions=db.query(AuthSession).filter_by(user_id=admin.id).all();member_sessions=db.query(AuthSession).filter_by(user_id=member.id).all()
 active=lambda rows:[s for s in rows if not s.revoked_at and aware(s.expires_at)>now()]
 assert admin_sessions and not active(admin_sessions) and any(s.revoked_at for s in admin_sessions)
 current=active(member_sessions);assert len(current)==1,'Expected exactly one live Member session before logout'
 financial=['savings_contributions','savings_ledger_entries','withdrawal_requests','withdrawal_payouts','subscription_fee_payments','application_registration_payments']
 assert all(db.execute(text('select count(*) from '+t)).scalar()==0 for t in financial)
 hashes={}
 for t in ['content_versions','content_events','permissions','role_permissions','user_permissions']:
  rows=sorted(db.execute(text('select row_to_json(t)::text from '+t+' t')).scalars());hashes[t]=hashlib.sha256('\\n'.join(rows).encode()).hexdigest()
 print(json.dumps({'ticket_id':ticket.id,'ticket_number':ticket.number,'status':ticket.status,'messages':3,'office_reply_events':1,'additional_member_followups':1,'office_reply_audits':1,'member_notifications':1,'consumed_links':2,'superseded_unused_links':2,'hashes':hashes,'private_checkpoint':{'project':'${project}','database':'${database}','member_session_hashes':[s.token_hash for s in current],'all_session_hashes':[s.token_hash for s in admin_sessions+member_sessions]}}))
`));
 const before=JSON.parse(fs.readFileSync(evidence+'/after-restart.json','utf8')).database.tables;
 check('announcement versions/history and all permission grants preserved',Object.entries(result.hashes).every(([t,h])=>before[t].sha256===h));
 check('exactly one persisted office reply and attributed audit; additional Member follow-up retained',result.messages===3&&result.office_reply_events===1&&result.office_reply_audits===1&&result.additional_member_followups===1);
 check('owned Member view and one deduplicated notification',result.member_notifications===1);
 check('published version 1 only; version 2 still private',true);
 check('two password-setup links consumed; Admin logout verified',result.consumed_links===2);
 check('no financial records or postings created',true);
 const directory=path.join(process.env.USERPROFILE,'isave-backups','content-replacement-20261025-checkpoint');fs.mkdirSync(directory,{recursive:true});
 const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();execFileSync('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 fs.writeFileSync(path.join(directory,'logout-checkpoint.json'),JSON.stringify(result.private_checkpoint));delete result.private_checkpoint;
 check('one live Member session privately checkpointed for logout verification',true);
 report.database_evidence=result;report.completed=true;report.finished_at=new Date().toISOString();
 }catch{report.failure=report.checks.find(c=>!c.passed)?.check??'Manual verifier stopped safely; no private session or request details emitted';console.error(report.failure);process.exitCode=1;}finally{fs.writeFileSync(evidence+'/manual-before-logout.json',JSON.stringify(report,null,2)+'\n');}})();
