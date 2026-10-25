"""Optional consent, permission boundaries and a one-claim recipient outbox."""
from datetime import timedelta
from uuid import uuid4
from unittest.mock import Mock
import pytest
from app.models.campaign import MarketingPreference,MarketingConsentEvent,Campaign,CampaignRecipient,CampaignEvent,CampaignUnsubscribeLink
from app.models.account_workflows import Notification
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.schemas.campaign import CONSENT_VERSION
from app.security.auth import now,digest
from app.services import campaigns as service
from app.services.invitation_delivery import DeliveryNotSubmitted,get_invitation_mailer
from tests.test_content_support import actors,save as save_content,publish,decide
from tests.test_auth import accounts

@pytest.fixture
def mailer(monkeypatch):
    mailer=Mock(available=True,mode='mailpit');monkeypatch.setattr(service,'delivery_available',lambda:True);monkeypatch.setattr(service,'get_invitation_mailer',lambda:mailer);return mailer
def consent(client,h,enabled=True,**extra):
    current=client.get('/api/v1/marketing/preferences',headers=h).json()
    return client.post('/api/v1/marketing/preferences',headers=h,json={'enabled':enabled,'base_revision':current['revision'],'version':CONSENT_VERSION,'request_key':str(uuid4()),**extra})
def campaign(client,h,**extra):
    content=publish(client,h,save_content(client,h).json())
    return client.post('/api/v1/campaigns',headers=h,json={'content_version_id':content['id'],'fields':{'subject':'TEST ONLY campaign','message':'Synthetic optional update'},'request_key':str(uuid4()),**extra})
def decision(client,h,c,action,**extra):
    return client.post(f'/api/v1/campaigns/{c["id"]}/decision',headers=h,json={'action':action,'base_event':c['base_event'],'reason':'TEST ONLY explicit action','request_key':str(uuid4()),**extra})
def queued(client,h):
    c=campaign(client,h).json();c=decision(client,h,c,'approve').json();p=client.get(f'/api/v1/campaigns/{c["id"]}/preview',headers=h).json()
    r=decision(client,h,c,'queue',confirm=True,preview_digest=p['preview_digest']);assert r.status_code==200,r.text;return r.json()

@pytest.mark.parametrize('role',['member','other','staff','finance'])
def test_campaign_office_permissions_are_not_implicit(client,actors,role):
    assert client.get('/api/v1/campaigns',headers=actors[role]).status_code==403
    assert client.post('/api/v1/campaigns',headers=actors[role],json={}).status_code==403
@pytest.mark.parametrize('role',['administrator','staff','finance'])
def test_only_members_manage_own_marketing(client,actors,role):assert client.get('/api/v1/marketing/preferences',headers=actors[role]).status_code==403

def test_default_no_consent_explicit_ownership_history_and_retry(client,db,actors,accounts):
    assert not client.get('/api/v1/marketing/preferences',headers=actors['member']).json()['enabled']
    assert db.query(MarketingPreference).count()==0
    body={'enabled':True,'base_revision':0,'version':CONSENT_VERSION,'request_key':str(uuid4())}
    for _ in range(2):assert client.post('/api/v1/marketing/preferences',headers=actors['member'],json=body).status_code==200
    assert db.query(MarketingConsentEvent).count()==1
    assert not client.get('/api/v1/marketing/preferences',headers=actors['other']).json()['enabled']
    assert client.post('/api/v1/marketing/preferences',headers=actors['member'],json={**body,'user_id':accounts['other'].id}).status_code==400
    assert consent(client,actors['member'],False).json()['history'][0]['source']=='member_preferences'

def test_publication_does_not_create_campaign_or_consent(client,db,actors):
    publish(client,actors['administrator'],save_content(client,actors['administrator']).json())
    assert db.query(Campaign).count()==db.query(CampaignRecipient).count()==db.query(MarketingPreference).count()==0

def test_approval_and_send_permissions_are_separate(client,db,accounts,actors,mailer):
    for code in ['campaigns:read','campaigns:prepare']:
        db.add(UserPermission(user_id=accounts['staff'].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();admin=actors['administrator'];c=campaign(client,admin).json()
    assert decision(client,actors['staff'],c,'approve').status_code==403
    assert decision(client,actors['staff'],c,'queue',confirm=True).status_code==403
    assert decision(client,admin,c,'queue',confirm=True).status_code==409
    c=decision(client,admin,c,'approve').json()
    assert decision(client,admin,c,'queue',confirm=False).status_code==400
    assert client.get(f'/api/v1/campaigns/{c["id"]}/recipients',headers=actors['staff']).status_code==403

def test_preview_count_queue_idempotency_and_stale_audience(client,db,actors,mailer):
    h=actors['administrator'];c=campaign(client,h).json();c=decision(client,h,c,'approve').json();url=f'/api/v1/campaigns/{c["id"]}/preview'
    old=client.get(url,headers=h).json();assert old['eligible_count']==0
    consent(client,actors['member']);p=client.get(url,headers=h).json();assert p['eligible_count']==1
    assert decision(client,h,c,'queue',confirm=True,preview_digest=old['preview_digest']).status_code==409
    body={'action':'queue','confirm':True,'preview_digest':p['preview_digest'],'base_event':c['base_event'],'reason':'TEST ONLY','request_key':str(uuid4())}
    for _ in range(2):assert client.post(f'/api/v1/campaigns/{c["id"]}/decision',headers=h,json=body).status_code==200
    assert db.query(CampaignRecipient).count()==1 and db.query(CampaignEvent).filter_by(action='queue').count()==1
    from app.models.content_support import ContentVersion
    linked=db.get(ContentVersion,c['content_version_id']);assert p['public_url'].endswith(f'/updates/{linked.item_id}/{linked.version}')

def test_unpublished_or_archived_content_and_incomplete_campaign_blocked(client,db,actors,mailer):
    h=actors['administrator'];draft=save_content(client,h).json()
    assert client.post('/api/v1/campaigns',headers=h,json={'content_version_id':draft['id'],'fields':{},'request_key':str(uuid4())}).status_code==400
    c=campaign(client,h,fields={}).json();assert decision(client,h,c,'approve').status_code==400
    assert client.get('/api/v1/public/content/1/999').status_code==404

def test_scheduling_cancellation_and_no_early_dispatch(client,db,actors,mailer,monkeypatch):
    h=actors['administrator'];consent(client,actors['member']);clock=now()
    c=campaign(client,h,fields={'subject':'Future','message':'Synthetic','scheduled_at':(clock+timedelta(hours=1)).isoformat()}).json();c=decision(client,h,c,'approve').json();p=client.get(f'/api/v1/campaigns/{c["id"]}/preview',headers=h).json();c=decision(client,h,c,'queue',confirm=True,preview_digest=p['preview_digest']).json()
    assert not service.process_one(db)
    c=decision(client,h,c,'cancel').json();assert c['state']=='Cancelled'
    monkeypatch.setattr(service,'now',lambda:clock+timedelta(hours=2));assert not service.process_one(db);assert not mailer.send_campaign.called

def test_withdrawn_consent_after_queue_is_suppressed(client,db,actors,mailer):
    consent(client,actors['member']);c=queued(client,actors['administrator']);consent(client,actors['member'],False)
    assert service.process_one(db);r=db.query(CampaignRecipient).one();assert r.state=='Suppressed' and not mailer.send_campaign.called
    assert service.present(db,db.get(Campaign,c['id']))['counts']=={'Suppressed':1}

def test_archived_after_queue_suppressed_without_send(client,db,actors,mailer):
    consent(client,actors['member']);c=queued(client,actors['administrator']);v=client.get('/api/v1/content/versions/'+str(c['content_version_id']),headers=actors['administrator']).json();assert decide(client,actors['administrator'],v,'archive').status_code==200
    assert service.process_one(db) and db.query(CampaignRecipient).one().state=='Suppressed'
    assert not mailer.send_campaign.called

def test_individual_capture_secure_scanner_safe_unsubscribe_and_essential_independence(client,db,actors,accounts,mailer,monkeypatch):
    consent(client,actors['member']);queued(client,actors['administrator']);assert service.process_one(db)
    r=db.query(CampaignRecipient).one();assert r.state=='Mailpit accepted' and r.attempts==1
    payload=mailer.send_campaign.call_args.kwargs;token=payload['unsubscribe_token'];assert payload['recipient']==accounts['member'].email
    assert db.get(CampaignUnsubscribeLink,digest(token)) and token not in client.get('/api/v1/campaigns',headers=actors['administrator']).text
    assert client.get('/api/v1/public/campaign-unsubscribe?token='+token).status_code==405
    assert client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':False}).status_code==400
    assert db.get(MarketingPreference,accounts['member'].id).enabled
    good=client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True})
    bad=client.post('/api/v1/public/campaign-unsubscribe',json={'token':'invalid','confirm':True});assert good.json()==bad.json() and good.status_code==200
    assert not db.get(MarketingPreference,accounts['member'].id).enabled
    assert client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True}).json()==good.json()
    assert db.query(MarketingConsentEvent).filter_by(source='email_unsubscribe').count()==1
    acknowledgement=db.query(MarketingConsentEvent).filter_by(source='email_unsubscribe').one()
    assert acknowledgement.wording=='Stop optional announcement and event emails.' and acknowledgement.version=='campaign-unsubscribe-v1'
    from app.services import account_workflows
    monkeypatch.setattr(account_workflows,'get_invitation_mailer',lambda:mailer)
    account_workflows.notify(db,accounts['member'].id,'essential-independent','Account update','dashboard');db.commit();notice=db.query(Notification).filter_by(event_key=str(accounts['member'].id)+':essential-independent').one()
    account_workflows.send_notice(db,accounts['administrator'],notice);assert mailer.send_notice.called and notice.delivery_state=='Mailpit accepted'

@pytest.mark.parametrize('error,state',[(DeliveryNotSubmitted(),'Failed before submission'),(RuntimeError(),'Uncertain')])
def test_failure_uncertainty_and_authorised_retry(client,db,actors,mailer,error,state):
    consent(client,actors['member']);queued(client,actors['administrator']);mailer.send_campaign.side_effect=error
    assert service.process_one(db);r=db.query(CampaignRecipient).one();assert r.state==state
    assert not service.process_one(db)
    url=f'/api/v1/campaigns/recipients/{r.id}/retry';body={'reason':'TEST ONLY retry','confirm':True,'request_key':str(uuid4())}
    response=client.post(url,headers=actors['administrator'],json=body)
    if state=='Uncertain':assert response.status_code==409
    else:
        assert response.status_code==200
        assert client.post(url,headers=actors['administrator'],json=body).status_code==200
        mailer.send_campaign.side_effect=None;assert service.process_one(db);assert r.attempts==2 and r.state=='Mailpit accepted'

def test_expired_unsubscribe_and_reoptin_old_link_are_generic(client,db,actors,accounts,mailer):
    consent(client,actors['member']);queued(client,actors['administrator']);service.process_one(db);token=mailer.send_campaign.call_args.kwargs['unsubscribe_token'];link=db.get(CampaignUnsubscribeLink,digest(token));link.expires_at=now()-timedelta(seconds=1);db.commit()
    assert client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True}).status_code==200
    assert db.get(MarketingPreference,accounts['member'].id).enabled

def test_recipient_access_is_dedicated_and_audited(client,db,actors,mailer):
    consent(client,actors['member']);c=queued(client,actors['administrator']);url=f'/api/v1/campaigns/{c["id"]}/recipients'
    assert client.get(url,headers=actors['member']).status_code==403
    response=client.get(url,headers=actors['administrator']);assert response.status_code==200 and response.json()['total']==1
    from app.models.audit_event import AuditEvent
    assert db.query(AuditEvent).filter_by(action='campaign_recipient_details_viewed').count()==1

@pytest.mark.parametrize('change',['suspend','address'])
def test_account_eligibility_rechecked_after_queue(client,db,actors,accounts,mailer,change):
    consent(client,actors['member']);queued(client,actors['administrator']);user=accounts['member']
    if change=='suspend':user.is_active=False
    else:user.email='changed@example.test'
    db.commit();assert service.process_one(db);assert db.query(CampaignRecipient).one().state=='Suppressed' and not mailer.send_campaign.called

def test_crash_after_claim_never_automatically_replays(client,db,actors,mailer,monkeypatch):
    consent(client,actors['member']);queued(client,actors['administrator'])
    original=service.lock_user
    def crash(*args):raise RuntimeError('Synthetic crash after committed claim')
    monkeypatch.setattr(service,'lock_user',crash)
    with pytest.raises(RuntimeError):service.process_one(db)
    db.rollback();monkeypatch.setattr(service,'lock_user',original)
    row=db.query(CampaignRecipient).one();assert row.state=='Attempted' and row.attempts==1 and db.query(CampaignUnsubscribeLink).count()==1
    assert not service.process_one(db) and not mailer.send_campaign.called

def test_new_draft_invalidates_approval_preserving_version_history(client,db,actors,mailer):
    h=actors['administrator'];c=campaign(client,h).json();c=decision(client,h,c,'approve').json()
    update=client.post('/api/v1/campaigns',headers=h,json={'campaign_id':c['id'],'base_version':1,'content_version_id':c['content_version_id'],'fields':{'subject':'TEST ONLY changed','message':'Synthetic changed text'},'request_key':str(uuid4())});assert update.status_code==200
    row=update.json();assert row['state']=='Draft' and len(row['versions'])==2 and len(row['history'])==1
    assert decision(client,h,row,'queue',confirm=True).status_code==409

def test_used_unsubscribe_link_does_not_override_later_fresh_consent(client,db,actors,accounts,mailer):
    consent(client,actors['member']);queued(client,actors['administrator']);service.process_one(db);token=mailer.send_campaign.call_args.kwargs['unsubscribe_token']
    for _ in range(2):assert client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True}).status_code==200
    consent(client,actors['member']);client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True})
    assert db.get(MarketingPreference,accounts['member'].id).enabled

def test_production_and_default_campaign_delivery_remain_blocked(monkeypatch):
    from app.config import get_settings
    settings=get_settings().model_copy(update={'campaign_delivery_enabled':False})
    monkeypatch.setattr(service,'get_settings',lambda:settings);assert not service.delivery_available()
    settings=settings.model_copy(update={'app_env':'production','invitation_delivery':'mailpit','campaign_delivery_enabled':True})
    monkeypatch.setattr('app.services.invitation_delivery.get_settings',lambda:settings);monkeypatch.setattr(service,'get_settings',lambda:settings)
    assert not service.delivery_available() and not get_invitation_mailer().available

def test_rate_limit_defers_without_dropping_queued_recipients(client,db,actors,mailer,monkeypatch):
    from app.config import get_settings
    settings=get_settings().model_copy(update={'campaign_local_rate_per_minute':1});monkeypatch.setattr(service,'get_settings',lambda:settings)
    consent(client,actors['member']);consent(client,actors['other']);queued(client,actors['administrator'])
    assert service.process_one(db) and not service.process_one(db)
    assert db.query(CampaignRecipient).filter_by(state='Mailpit accepted').count()==1 and db.query(CampaignRecipient).filter_by(state='Queued').count()==1

def test_email_unsubscribe_after_later_queue_suppresses_unsent_message(client,db,actors,mailer):
    consent(client,actors['member']);queued(client,actors['administrator']);assert service.process_one(db)
    token=mailer.send_campaign.call_args.kwargs['unsubscribe_token'];queued(client,actors['administrator'])
    assert client.post('/api/v1/public/campaign-unsubscribe',json={'token':token,'confirm':True}).status_code==200
    assert service.process_one(db) and mailer.send_campaign.call_count==1
    assert db.query(CampaignRecipient).filter_by(state='Suppressed').count()==1

@pytest.mark.parametrize('capability',['prepare','approve','send'])
def test_action_only_grant_cannot_bypass_campaign_read(client,db,actors,accounts,capability):
    db.add(UserPermission(user_id=accounts['staff'].id,permission_id=db.query(Permission).filter_by(code='campaigns:'+capability).one().id,allowed=True));db.commit()
    if capability=='prepare':r=client.post('/api/v1/campaigns',headers=actors['staff'],json={'content_version_id':1,'fields':{},'request_key':str(uuid4())})
    else:
        row=campaign(client,actors['administrator']).json();r=decision(client,actors['staff'],row,'approve' if capability=='approve' else 'queue',confirm=True)
    assert r.status_code==403

def test_count_only_preview_uses_keyed_audience_digest(client,db,actors,accounts,mailer,monkeypatch):
    from app.config import get_settings
    consent(client,actors['member']);c=campaign(client,actors['administrator']).json();row=db.get(Campaign,c['id']);first=service.preview(db,row)
    settings=get_settings().model_copy(update={'secret_key':'synthetic-other-preview-key'})
    monkeypatch.setattr(service,'get_settings',lambda:settings);second=service.preview(db,row)
    assert first['eligible_count']==second['eligible_count']==1 and first['preview_digest']!=second['preview_digest']
    assert accounts['member'].email not in str(second)
