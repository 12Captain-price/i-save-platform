"""Consent-aware local campaigns. No publication hook, production adapter or auto-resend."""
import json,secrets,hashlib,hmac
from datetime import timedelta
from sqlalchemy import select,func
from app.config import get_settings
from app.exceptions import APIError
from app.models.campaign import MarketingPreference as Preference,MarketingConsentEvent as Consent,Campaign,CampaignVersion as Version,CampaignEvent as Event,CampaignRecipient as Recipient,CampaignDeliveryEvent as Delivery,CampaignUnsubscribeLink as Link
from app.models.user import User
from app.models.role import Role
from app.models.content_support import ContentVersion,ContentItem
from app.models.audit_event import AuditEvent
from app.schemas.campaign import CONSENT_WORDING,CONSENT_VERSION,UNSUBSCRIBE_WORDING,UNSUBSCRIBE_VERSION
from app.security.auth import now,aware,digest,permissions
from app.services.membership import advisory
from app.services.content_support import public_items
from app.services.invitation_delivery import get_invitation_mailer,DeliveryNotSubmitted

def fail(message,status=409):raise APIError(status,'campaign',message)
def snap(body):return json.dumps(body.model_dump(mode='json'),sort_keys=True)
def audit(db,actor,action,table,identifier):db.add(AuditEvent(event_type='campaign',actor_user_id=actor.id if actor else None,actor_email=actor.email if actor else None,action=action,target_table=table,target_id=str(identifier)))
def lock_user(db,identifier):return db.execute(select(User).where(User.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one()
def lock_campaign(db,identifier):
    row=db.execute(select(Campaign).where(Campaign.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not row:fail('Campaign not found',404)
    return row
def latest(db,c):return db.query(Version).filter_by(campaign_id=c.id,version=c.latest_version).one()
def delivery_available():return get_settings().campaign_delivery_enabled and get_invitation_mailer().available and get_invitation_mailer().mode=='mailpit'
def preference(db,user):
    row=db.get(Preference,user.id)
    return {'enabled':row.enabled if row else False,'revision':row.revision if row else 0,'version':CONSENT_VERSION,'wording':CONSENT_WORDING,
      'history':[{'enabled':e.enabled,'source':e.source,'wording':e.wording,'version':e.version,'recorded_at':e.recorded_at} for e in db.query(Consent).filter_by(user_id=user.id).order_by(Consent.id.desc()).limit(50)]}
def change_preference(db,user,body):
    lock_user(db,user.id);advisory(db,'marketing-key:'+str(body.request_key))
    old=db.query(Consent).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.user_id!=user.id or old.request_snapshot!=snap(body):fail('Request key already used')
        return preference(db,user)
    row=db.get(Preference,user.id)
    if body.version!=CONSENT_VERSION:fail('Consent wording changed; refresh before confirming')
    if body.base_revision!=(row.revision if row else 0):fail('Preferences changed; refresh before confirming')
    if not row:row=Preference(user_id=user.id,enabled=False,revision=0);db.add(row)
    row.enabled=body.enabled;row.revision+=1
    db.add(Consent(user_id=user.id,enabled=body.enabled,source='member_preferences',wording=CONSENT_WORDING,version=CONSENT_VERSION,actor_id=user.id,request_key=str(body.request_key),request_snapshot=snap(body)));db.flush();audit(db,user,'marketing_preference_changed','marketing_preferences',user.id)
    return preference(db,user)
def unsubscribe(db,token):
    row=db.get(Link,digest(token))
    if not row:return
    recipient=db.get(Recipient,row.recipient_id);user=lock_user(db,recipient.user_id);db.refresh(row,with_for_update=True)
    if row.consumed_at or aware(row.expires_at)<=now():return
    row.consumed_at=now();p=db.get(Preference,user.id)
    if not p:p=Preference(user_id=user.id,enabled=False,revision=0);db.add(p)
    p.enabled=False;p.revision+=1
    db.add(Consent(user_id=user.id,enabled=False,source='email_unsubscribe',wording=UNSUBSCRIBE_WORDING,version=UNSUBSCRIBE_VERSION,actor_id=None,request_key='unsubscribe:'+row.token_hash,request_snapshot='Explicit public confirmation; opaque hash only'))
    audit(db,None,'marketing_email_unsubscribe','marketing_preferences',user.id)

def eligible(db,user):
    p=db.get(Preference,user.id)
    return bool(user.is_active and user.role and user.role.name=='member' and p and p.enabled)
def audience(db):return db.query(User).join(Role).join(Preference,Preference.user_id==User.id).filter(Role.name=='member',User.is_active.is_(True),Preference.enabled.is_(True)).order_by(User.id).all()
def linked_content(db,v):
    content=db.get(ContentVersion,v.content_version_id)
    if not content:return None
    item=db.get(ContentItem,content.item_id)
    if item.kind not in {'announcement','event'}:return None
    return next((r for r in public_items(db,item.kind) if r['item_id']==item.id and r['version']==content.version),None)
def public_url(row):return get_settings().password_setup_frontend_url.rstrip('/')+'/updates/'+str(row['item_id'])+'/'+str(row['version'])
def content_choices(db):
    items=[]
    for kind in ['announcement','event']:
        for item in public_items(db,kind):
            v=db.query(ContentVersion).filter_by(item_id=item['item_id'],version=item['version']).one()
            items.append({'id':v.id,'kind':kind,'version':v.version,'title':item['fields']['title'],'public_path':'/updates/'+str(item['item_id'])+'/'+str(v.version)})
    return items
def preview(db,c,users=None):
    v=latest(db,c);fields=json.loads(v.snapshot);content=linked_content(db,v);users=audience(db) if users is None else users
    missing=[]
    if not fields['subject']:missing.append('Email subject is required.')
    if not fields['message']:missing.append('Campaign message is required.')
    if not content:missing.append('Linked announcement/event is not currently publicly available.')
    if len({u.email.casefold() for u in users})!=len(users):missing.append('Ambiguous recipient addresses require authorised account review before queueing.')
    criteria=[(u.id,u.email,db.get(Preference,u.id).revision) for u in users]
    # Do not expose an unkeyed digest of recipient addresses to count-only readers.
    fingerprint=hmac.new(get_settings().secret_key.encode(),json.dumps([v.id,fields,criteria,bool(content)],sort_keys=True).encode(),hashlib.sha256).hexdigest()
    return {'subject':fields['subject'],'message':fields['message'],'linked_content_version_id':v.content_version_id,'linked_content':content,'public_url':public_url(content) if content else None,'audience':'Active Member accounts with explicit optional-email consent','eligible_count':len(users),'scheduled_at':fields['scheduled_at'],'preview_digest':fingerprint,'missing':missing,'delivery_available':delivery_available(),'delivery_mode':'Local Mailpit capture only' if delivery_available() else 'Unavailable; no production campaign provider is enabled','production_blockers':['Approved provider and verified sender','Authenticated bounce/complaint handling','Approved consent, privacy and retention operations','Deliverability and operational approval']}
def present(db,c):
    v=latest(db,c);events=db.query(Event).filter_by(campaign_id=c.id).order_by(Event.id).all()
    counts=dict(db.query(Recipient.state,func.count(Recipient.id)).filter_by(campaign_id=c.id).group_by(Recipient.state).all())
    return {'id':c.id,'version':v.version,'version_id':v.id,'state':c.state,'fields':json.loads(v.snapshot),'content_version_id':v.content_version_id,'scheduled_at':c.scheduled_at,'base_event':events[-1].id if events else 0,'counts':counts,
      'history':[{'id':e.id,'action':e.action,'version_id':e.version_id,'reason':e.reason,'actor':e.actor_email,'recorded_at':e.recorded_at} for e in events],
      'versions':[{'id':r.id,'version':r.version,'content_version_id':r.content_version_id,'fields':json.loads(r.snapshot),'actor':r.actor_email,'recorded_at':r.recorded_at} for r in db.query(Version).filter_by(campaign_id=c.id).order_by(Version.version.desc()).limit(100)]}
def save(db,actor,body):
    advisory(db,'campaign-key:'+str(body.request_key));old=db.query(Version).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.actor_id!=actor.id or old.request_snapshot!=snap(body):fail('Request key already used')
        return present(db,db.get(Campaign,old.campaign_id))
    if body.campaign_id:
        c=lock_campaign(db,body.campaign_id)
        if c.state not in {'Draft','Approved'} or c.latest_version!=body.base_version:fail('Campaign changed or dispatch was queued; refresh before editing')
    else:
        if body.base_version:fail('New campaign must start at version zero',400)
        c=Campaign(latest_version=0,state='Draft');db.add(c);db.flush()
    if not db.get(ContentVersion,body.content_version_id):fail('Published content version not found',400)
    test=type('Linked',(),{'content_version_id':body.content_version_id})()
    if not linked_content(db,test):fail('Choose an effective published announcement or event',400)
    c.latest_version+=1;c.state='Draft';c.scheduled_at=None
    v=Version(campaign_id=c.id,version=c.latest_version,content_version_id=body.content_version_id,snapshot=json.dumps(body.fields.model_dump(mode='json'),sort_keys=True),actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snap(body));db.add(v);db.flush();audit(db,actor,'campaign_draft_saved','campaign_versions',v.id)
    return present(db,c)
def delivery_event(db,r,state,reason):
    r.state=state;r.reason=reason;db.add(Delivery(recipient_id=r.id,state=state,reason=reason))
def decision(db,actor,identifier,body):
    if not body.reason.strip():fail('Record a reason for this action',400)
    advisory(db,'campaign-action:'+str(body.request_key));c=lock_campaign(db,identifier);v=latest(db,c)
    old=db.query(Event).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if old.campaign_id!=c.id or old.actor_id!=actor.id or old.request_snapshot!=snap(body):fail('Request key already used')
        return present(db,c)
    state=present(db,c)
    if state['base_event']!=body.base_event:fail('Campaign changed; refresh before acting')
    users=audience(db);p=preview(db,c,users)
    if body.action=='approve':
        if c.state!='Draft' or p['missing']:fail('; '.join(p['missing']) or 'Only drafts may be approved',400)
        c.state='Approved'
    elif body.action=='queue':
        if c.state!='Approved':fail('Explicit approval of this saved version is required')
        if not body.confirm:fail('Explicit irreversible-action confirmation required',400)
        if not delivery_available():fail('Campaign sending unavailable: local testing must be explicitly enabled; production sending is disabled',503)
        if p['missing']:fail('; '.join(p['missing']),400)
        if body.preview_digest!=p['preview_digest']:fail('Audience or saved preview changed; reload and confirm the current preview')
        if not p['eligible_count']:fail('No eligible consenting recipients; nothing queued',400)
        if p['eligible_count']>1000:fail('Local campaign limit is 1000 recipients; refine approved audience handling before production',400)
        fields=json.loads(v.snapshot)
        if fields['scheduled_at']:
            from datetime import datetime
            when=datetime.fromisoformat(fields['scheduled_at'])
            if aware(when)<now():fail('Scheduled time has passed; save and approve a new draft',400)
        else:when=now()
        c.state='Queued';c.scheduled_at=when
        for user in users:
            r=Recipient(campaign_id=c.id,version_id=v.id,user_id=user.id,email_snapshot=user.email,state='Queued',attempts=0,reason='');db.add(r);db.flush();delivery_event(db,r,'Queued','Explicitly approved audience snapshot')
    else:
        if c.state not in {'Draft','Approved','Queued'}:fail('This campaign cannot be cancelled')
        if db.query(Recipient).filter(Recipient.campaign_id==c.id,Recipient.attempts>0).first():fail('Dispatch has started; cancellation is available only before dispatch')
        c.state='Cancelled'
        for r in db.query(Recipient).filter_by(campaign_id=c.id,state='Queued'):delivery_event(db,r,'Cancelled','Campaign cancelled before dispatch')
    db.add(Event(campaign_id=c.id,version_id=v.id,action=body.action,reason=body.reason,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=snap(body)));db.flush();audit(db,actor,'campaign_'+body.action,'campaigns',c.id)
    return present(db,c)
def retry(db,actor,identifier,body):
    if not body.reason.strip():fail('Record a retry reason',400)
    advisory(db,'campaign-action:'+str(body.request_key));r=db.get(Recipient,identifier)
    if not r:fail('Recipient delivery not found',404)
    c=lock_campaign(db,r.campaign_id);r=db.execute(select(Recipient).where(Recipient.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one()
    old=db.query(Event).filter_by(request_key=str(body.request_key)).one_or_none()
    identity=json.dumps([identifier,body.model_dump(mode='json')],sort_keys=True)
    if old:
        if old.campaign_id!=c.id or old.actor_id!=actor.id or old.request_snapshot!=identity:fail('Request key already used')
        return present(db,c)
    if not body.confirm or r.state!='Failed before submission':fail('Only a confirmed failure before SMTP submission can be retried')
    if not delivery_available() or c.state=='Cancelled':fail('Campaign delivery unavailable',503)
    delivery_event(db,r,'Queued','Authorised retry after proven failure before submission');c.state='Queued'
    db.add(Event(campaign_id=c.id,version_id=r.version_id,action='retry:'+str(r.id),reason=body.reason,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=identity));db.flush();audit(db,actor,'campaign_delivery_retry','campaigns',c.id)
    return present(db,c)
def finish(db,c):
    db.flush()
    if c.state=='Cancelled':return
    if not db.query(Recipient).filter(Recipient.campaign_id==c.id,Recipient.state.in_(['Queued','Attempted'])).first():c.state='Complete'

def process_one(db):
    """Claim once, commit before I/O, then recheck under locks held through SMTP.

    A crash after claim leaves Attempted (unknown outcome), never an automatic retry.
    Unsubscribe/content archive serialize before or after the dispatch critical section.
    """
    if not delivery_available():return False
    advisory(db,'campaign-dispatch-rate')
    recent=db.query(Delivery).filter(Delivery.state=='Attempted',Delivery.recorded_at>=now()-timedelta(minutes=1)).count()
    if recent>=get_settings().campaign_local_rate_per_minute:db.rollback();return False
    r=db.execute(select(Recipient).join(Campaign).where(Recipient.state=='Queued',Campaign.state=='Queued',Campaign.scheduled_at<=now()).order_by(Recipient.id).with_for_update(skip_locked=True,of=Recipient).limit(1)).scalar_one_or_none()
    if not r:db.rollback();return False
    token=secrets.token_urlsafe(32)
    db.add(Link(token_hash=digest(token),recipient_id=r.id,expires_at=now()+timedelta(days=30)))
    r.attempts+=1;r.attempted_at=now();delivery_event(db,r,'Attempted','Claimed once; SMTP result is not yet known');identifier=r.id;db.commit()
    # Lock order: recipient user, content item, campaign, recipient. Consent changes
    # and suspension cannot complete while this send critical section is running.
    r=db.get(Recipient,identifier);user=lock_user(db,r.user_id);v=db.get(Version,r.version_id);content=db.get(ContentVersion,v.content_version_id)
    db.execute(select(ContentItem).where(ContentItem.id==content.item_id).with_for_update()).scalar_one()
    c=lock_campaign(db,r.campaign_id);db.refresh(r,with_for_update=True)
    if c.state=='Cancelled':delivery_event(db,r,'Cancelled','Cancelled before submission');finish(db,c);db.commit();return True
    reason=''
    if not eligible(db,user):reason='Consent withdrawn or account no longer eligible'
    elif user.email!=r.email_snapshot:reason='Recipient address changed; no message sent'
    elif db.query(User).filter(func.lower(User.email)==user.email.lower()).count()!=1:reason='Ambiguous recipient address; account review required'
    elif not linked_content(db,v):reason='Linked content is no longer publicly available'
    if reason:delivery_event(db,r,'Suppressed',reason);finish(db,c);db.commit();return True
    # The hash was committed with the claim, so a link remains usable even if a
    # crash loses the result commit. Retain eligibility/content locks through I/O.
    db.flush();fields=json.loads(v.snapshot);public=linked_content(db,v)
    from app.services.business_settings import public_contacts
    try:
        get_invitation_mailer().send_campaign(recipient=r.email_snapshot,subject=fields['subject'],message=fields['message'],public_url=public_url(public),unsubscribe_token=token,recipient_id=r.id,contacts=public_contacts(db))
        delivery_event(db,r,'Mailpit accepted','Local SMTP capture accepted; inbox delivery is not claimed')
    except DeliveryNotSubmitted:delivery_event(db,r,'Failed before submission','Connection failed before any SMTP submission; authorised retry is available')
    except Exception:delivery_event(db,r,'Uncertain','Submission outcome is unknown; automatic and blind retry are blocked')
    finish(db,c);audit(db,None,'campaign_dispatch_result','campaigns',c.id);db.commit();return True
