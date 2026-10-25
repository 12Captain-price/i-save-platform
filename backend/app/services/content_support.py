"""Serialized editorial review, private support history and transactional notices."""
import hashlib,io,json
from types import SimpleNamespace
from uuid import uuid4
from PIL import Image
from sqlalchemy import select
from app.exceptions import APIError
from app.models.content_support import ContentItem,ContentVersion,ContentEvent,PublicMedia,SupportTicket,TicketEvent,TicketMessage
from app.models.user import User
from app.models.audit_event import AuditEvent
from app.security.auth import now,aware,permissions
from app.services.membership import advisory
from app.services.account_workflows import notify


def fail(message,status=409):raise APIError(status,'content_support',message)
def snapshot(body):return json.dumps(body.model_dump(mode='json'),sort_keys=True)
def audit(db,actor,action,table,identifier):
    db.add(AuditEvent(event_type='content_support',actor_user_id=actor.id,actor_email=actor.email,action=action,target_table=table,target_id=str(identifier)))


def office_recipients(db,capability):
    return [u for u in db.query(User).filter_by(is_active=True) if u.role and u.role.name in {'administrator','staff'} and capability in permissions(db,u)]


def content_history(db,version):return db.query(ContentEvent).filter_by(version_id=version.id).order_by(ContentEvent.id).all()


def missing(kind,fields):
    result=[]
    if not fields['title'].strip():result.append('Title is required.')
    if not fields['body'].strip():result.append('Public text is required.')
    if kind=='team' and not fields['team_role'].strip():result.append('Team role is required.')
    if kind=='event':
        if not fields['starts_at']:result.append('Event start in Harare time is required.')
        if not fields['location'].strip():result.append('Event location is required.')
        if not fields['event_status']:result.append('Event status is required.')
        if fields['starts_at'] and fields['ends_at']:
            from datetime import datetime
            if datetime.fromisoformat(fields['ends_at'])<datetime.fromisoformat(fields['starts_at']):result.append('Event end must not precede start.')
    return result


def content_present(db,v):
    history=content_history(db,v);fields=json.loads(v.snapshot);item=db.get(ContentItem,v.item_id)
    media=db.get(PublicMedia,v.media_id) if v.media_id else None
    return {'id':v.id,'item_id':item.id,'kind':item.kind,'version':v.version,'latest_version':item.latest_version,'fields':fields,
        'media':{'id':media.id,'alt':media.alt,'rights_note':media.rights_note,'scan_engine':media.scan_engine} if media else None,
        'state':history[-1].state if history else 'Draft','base_event':history[-1].id if history else 0,
        'missing':missing(item.kind,fields),'author':v.actor_email,'recorded_at':v.recorded_at,
        'history':[{'id':e.id,'state':e.state,'reason':e.reason,'effective_at':e.effective_at,'actor':e.actor_email,'recorded_at':e.recorded_at} for e in history]}


def save_content(db,actor,body):
    advisory(db,'content-key:'+str(body.request_key))
    old=db.query(ContentVersion).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.actor_id!=actor.id or old.request_snapshot!=snapshot(body):fail('Request key already used')
        return content_present(db,old)
    if body.item_id:
        item=db.execute(select(ContentItem).where(ContentItem.id==body.item_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
        if not item:fail('Content item not found',404)
        if item.kind!=body.kind or item.latest_version!=body.base_version:fail('Content changed; refresh before saving')
    else:
        if body.base_version:fail('New item must start at version zero',400)
        item=ContentItem(kind=body.kind,latest_version=0);db.add(item);db.flush()
    if body.fields.media_id and not db.get(PublicMedia,body.fields.media_id):fail('Only separately scanned public media may be selected',400)
    item.latest_version+=1
    v=ContentVersion(item_id=item.id,version=item.latest_version,snapshot=json.dumps(body.fields.model_dump(mode='json'),sort_keys=True),media_id=body.fields.media_id,
        actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snapshot(body))
    db.add(v);db.flush();audit(db,actor,'content_draft_saved','content_versions',v.id)
    return content_present(db,v)


def content_decision(db,actor,identifier,body):
    advisory(db,'content-event-key:'+str(body.request_key))
    old=db.query(ContentEvent).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.actor_id!=actor.id or old.version_id!=identifier or old.request_snapshot!=snapshot(body):fail('Request key already used')
        return content_present(db,db.get(ContentVersion,identifier))
    v=db.get(ContentVersion,identifier)
    if not v:fail('Version not found',404)
    item=db.execute(select(ContentItem).where(ContentItem.id==v.item_id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    current=content_present(db,v)
    if current['base_event']!=body.base_event:fail('Review changed; refresh before taking an action')
    transitions={'submit':({'Draft','Changes requested'},'In review','draft'),'request_changes':({'In review'},'Changes requested','review'),
        'approve':({'In review'},'Approved','review'),'publish':({'Approved'},'Published','publish'),'archive':({'Draft','Changes requested','In review','Approved','Published'},'Archived','archive')}
    sources,target,cap=transitions[body.action]
    if 'content:'+cap not in permissions(db,actor):fail('Permission required',403)
    if body.action!='archive' and v.version!=item.latest_version:fail('Only the latest saved version may proceed')
    if current['state'] not in sources:fail('This action is not available in the current state')
    if not body.reason.strip():fail('Record a reason',400)
    if body.action in {'approve','publish'} and current['missing']:fail('; '.join(current['missing']),400)
    effective=None
    if body.action=='publish':
        if not body.effective_at:fail('Choose an explicit publication time in Harare',400)
        effective=body.effective_at
    elif body.effective_at:fail('Effective dates apply only to publication',400)
    e=ContentEvent(version_id=v.id,state=target,reason=body.reason,effective_at=effective,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snapshot(body))
    db.add(e);db.flush();audit(db,actor,'content_'+body.action,'content_versions',v.id)
    recipients=office_recipients(db,'content:review') if body.action=='submit' else [db.get(User,v.actor_id)]
    for u in recipients:
        if u and u.is_active and 'content:read' in permissions(db,u):notify(db,u.id,'content-event:'+str(e.id),'A content review or publication status has changed. Check the protected content queue.','cms')
    return content_present(db,v)


def public_items(db,kind=None):
    # Select the newest effective publication per item. Archiving that version
    # hides it; it must not cause an older publication to reappear.
    query=db.query(ContentItem)
    if kind:query=query.filter_by(kind=kind)
    items=[]
    for item in query.order_by(ContentItem.id):
        publications=db.query(ContentEvent).join(ContentVersion,ContentVersion.id==ContentEvent.version_id).filter(ContentVersion.item_id==item.id,ContentEvent.state=='Published',ContentEvent.effective_at<=now()).order_by(ContentEvent.effective_at.desc(),ContentEvent.id.desc())
        pub=publications.first()
        if not pub:continue
        v=db.get(ContentVersion,pub.version_id)
        if any(e.state=='Archived' and e.id>pub.id for e in content_history(db,v)):continue
        media=db.get(PublicMedia,v.media_id) if v.media_id else None
        items.append({'item_id':item.id,'kind':item.kind,'version':v.version,'fields':json.loads(v.snapshot),'effective_at':pub.effective_at,
            'media':{'id':media.id,'alt':media.alt} if media else None})
    return items


def upload_media(db,actor,body):
    from app.services.evidence import validate_upload
    advisory(db,'public-media-key:'+str(body.request_key))
    old=db.query(PublicMedia).filter_by(request_key=str(body.request_key)).one_or_none()
    if not body.rights_confirmed or not body.alt.strip() or not body.rights_note.strip():fail('Confirm publication rights/consent and provide image description',400)
    prepared=validate_upload(SimpleNamespace(kind='public',filename=body.filename,content_type=body.content_type,data=body.data))
    # Strip EXIF/text metadata and discard filenames before separate public storage.
    with Image.open(io.BytesIO(prepared['content'])) as image:
        out=io.BytesIO();image.convert('RGB').save(out,format='PNG');content=out.getvalue()
    if len(content)>2*1024*1024:fail('Processed public image exceeds 2 MiB',400)
    sha=hashlib.sha256(content).hexdigest()
    if old:
        if old.actor_id!=actor.id or old.sha256!=sha or old.alt!=body.alt or old.rights_note!=body.rights_note:fail('Request key already used')
        return {'id':old.id,'alt':old.alt,'scan_engine':old.scan_engine}
    row=PublicMedia(content=content,content_type='image/png',sha256=sha,scan_engine=prepared['scan_engine'],alt=body.alt,rights_note=body.rights_note,actor_id=actor.id,request_key=str(body.request_key))
    db.add(row);db.flush();audit(db,actor,'public_media_uploaded','public_media',row.id)
    return {'id':row.id,'alt':row.alt,'scan_engine':row.scan_engine}


def ticket_query(db,actor):
    if actor.role and actor.role.name=='member':
        if 'support:own' not in permissions(db,actor):fail('Permission required',403)
        return db.query(SupportTicket).filter_by(user_id=actor.id)
    if 'support:read' not in permissions(db,actor):fail('Permission required',403)
    return db.query(SupportTicket)


def ticket_present(db,actor,row):
    member=actor.role and actor.role.name=='member'
    messages=db.query(TicketMessage).filter_by(ticket_id=row.id)
    events=db.query(TicketEvent).filter_by(ticket_id=row.id)
    if member or 'support:internal' not in permissions(db,actor):
        messages=messages.filter_by(internal=False);events=events.filter(TicketEvent.action!='internal_note')
    return {'id':row.id,'number':row.number,'subject':row.subject,'category':row.category,'status':row.status,'revision':row.revision,'created_at':row.created_at,
        'assigned_to':None if member else row.assigned_to,
        'messages':[{'id':m.id,'body':m.body,'internal':m.internal,'actor':('Member' if m.actor_id==row.user_id else 'Office') if member else m.actor_email,'recorded_at':m.recorded_at} for m in messages.order_by(TicketMessage.id)],
        'history':[{'id':e.id,'action':e.action,'status':e.status,'actor':('Member' if e.actor_id==row.user_id else 'Office') if member else e.actor_email,'reason':e.reason if member and e.action!='assign' else '' if member else e.reason,'recorded_at':e.recorded_at} for e in events.order_by(TicketEvent.id)]}


def ticket_event(db,actor,row,action,body,message='',internal=False,reason=''):
    row.revision+=1
    e=TicketEvent(ticket_id=row.id,action=action,status=row.status,reason=reason,assigned_to=row.assigned_to,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snapshot(body))
    db.add(e);db.flush()
    if message:db.add(TicketMessage(ticket_id=row.id,event_id=e.id,internal=internal,body=message,actor_id=actor.id,actor_email=actor.email))
    audit(db,actor,'support_'+action,'support_tickets',row.id)
    if not internal:
        recipients=office_recipients(db,'support:read') if actor.id==row.user_id else [db.get(User,row.user_id)]
        for u in recipients:
            if u and u.is_active:notify(db,u.id,'ticket-event:'+str(e.id),'A support ticket has an update. Open your private support centre.','support')
    db.flush()


def create_ticket(db,actor,body):
    if not actor.role or actor.role.name!='member' or 'support:own' not in permissions(db,actor):fail('Member support permission required',403)
    advisory(db,'ticket-key:'+str(body.request_key))
    old=db.query(TicketEvent).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.actor_id!=actor.id or old.action!='created' or old.request_snapshot!=snapshot(body):fail('Request key already used')
        return ticket_present(db,actor,ticket_query(db,actor).filter_by(id=old.ticket_id).one())
    if not body.subject.strip() or not body.message.strip():fail('Subject and message are required',400)
    row=SupportTicket(number='SUP-'+uuid4().hex[:16].upper(),user_id=actor.id,subject=body.subject,category=body.category,status='Open',revision=0)
    db.add(row);db.flush();ticket_event(db,actor,row,'created',body,body.message)
    return ticket_present(db,actor,row)


def ticket_action(db,actor,identifier,body):
    advisory(db,'ticket-key:'+str(body.request_key))
    row=ticket_query(db,actor).filter_by(id=identifier).with_for_update().execution_options(populate_existing=True).one_or_none()
    if not row:fail('Ticket not found',404)
    old=db.query(TicketEvent).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.ticket_id!=row.id or old.actor_id!=actor.id or old.request_snapshot!=snapshot(body):fail('Request key already used')
        return ticket_present(db,actor,row)
    if row.revision!=body.base_revision:fail('Ticket changed; refresh before retrying')
    member=actor.role and actor.role.name=='member'
    if member and body.action not in {'reply','reopen'}:fail('Permission required',403)
    cap={'reply':'reply','internal_note':'internal','assign':'assign','status':'resolve','reopen':'reply'}[body.action]
    if not member and 'support:'+cap not in permissions(db,actor):fail('Permission required',403)
    if body.action in {'reply','internal_note'}:
        if not body.message.strip():fail('Message is required',400)
        if row.status=='Resolved':fail('Reopen the ticket explicitly before replying')
    elif body.action=='assign':
        user=db.get(User,body.assignee_id) if body.assignee_id else None
        if user and (not user.is_active or not user.role or user.role.name not in {'staff','administrator'} or 'support:read' not in permissions(db,user)):fail('Choose an active authorised support assignee',400)
        if body.assignee_id and not user:fail('Assignee not found',400)
        row.assigned_to=body.assignee_id
    elif body.action=='status':
        if not body.status or body.status==row.status:fail('Choose a different supported status',400)
        if row.status=='Resolved':fail('Reopen explicitly before changing status')
        row.status=body.status
    else:
        if row.status!='Resolved':fail('Only resolved tickets can be reopened')
        row.status='Open'
    if body.action not in {'reply','internal_note'} and not body.reason.strip():fail('Record a reason',400)
    ticket_event(db,actor,row,body.action,body,body.message if body.action in {'reply','internal_note'} else '',body.action=='internal_note',body.reason)
    return ticket_present(db,actor,row)
