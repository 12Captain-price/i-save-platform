"""Permissioned campaign operations; owned preferences; scanner-safe public opt-out."""
from fastapi import APIRouter,Depends,Query,Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.campaign import Campaign,CampaignRecipient as Recipient,CampaignDeliveryEvent as Delivery
from app.security.auth import current_user,current_session,require,permissions,digest
from app.services.membership import lock_actor
from app.services import campaigns as service
from app.schemas.campaign import SaveCampaign,CampaignDecision,CampaignRetry,Preference,Unsubscribe
router=APIRouter(prefix='/api/v1',tags=['optional email campaigns'])
def mutation(cap):
    def dependency(actor:User=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
        lock_actor(db,actor,session,cap)
        if cap.startswith('campaigns:') and 'campaigns:read' not in permissions(db,actor):service.fail('Campaign read permission required',403)
        return actor
    return dependency
@router.get('/marketing/preferences')
def preferences(actor:User=Depends(require('marketing:own')),db:Session=Depends(get_db)):return service.preference(db,actor)
@router.post('/marketing/preferences')
def update_preferences(body:Preference,actor:User=Depends(mutation('marketing:own')),db:Session=Depends(get_db)):
    result=service.change_preference(db,actor,body);db.commit();return result
@router.post('/public/campaign-unsubscribe')
def unsubscribe(body:Unsubscribe,request:Request,db:Session=Depends(get_db)):
    from app.services.auth import throttle
    throttle(db,digest('campaign-unsubscribe-ip:'+(request.client.host if request.client else 'unknown')))
    if not body.confirm:service.fail('Explicit confirmation is required; opening a link does not change preferences',400)
    service.unsubscribe(db,body.token);db.commit()
    return {'message':'Your request has been received. Optional email preferences are processed where the link is valid. Essential account and security notifications are unchanged.'}
@router.get('/campaigns/content')
def content(actor:User=Depends(require('campaigns:read')),db:Session=Depends(get_db)):return {'items':service.content_choices(db)}
@router.get('/campaigns')
def listing(q:str=Query('',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor:User=Depends(require('campaigns:read')),db:Session=Depends(get_db)):
    from app.models.campaign import CampaignVersion
    query=db.query(Campaign).join(CampaignVersion).filter(CampaignVersion.version==Campaign.latest_version)
    if q:query=query.filter(CampaignVersion.snapshot.icontains(q,autoescape=True))
    return {'total':query.count(),'items':[service.present(db,c) for c in query.order_by(Campaign.id.desc()).offset(skip).limit(limit)]}
@router.post('/campaigns')
def save(body:SaveCampaign,actor:User=Depends(mutation('campaigns:prepare')),db:Session=Depends(get_db)):
    result=service.save(db,actor,body);db.commit();return result
@router.get('/campaigns/{identifier}')
def detail(identifier:int,actor:User=Depends(require('campaigns:read')),db:Session=Depends(get_db)):
    c=db.get(Campaign,identifier)
    if not c:service.fail('Campaign not found',404)
    return service.present(db,c)
@router.get('/campaigns/{identifier}/preview')
def preview(identifier:int,actor:User=Depends(require('campaigns:read')),db:Session=Depends(get_db)):
    c=db.get(Campaign,identifier)
    if not c:service.fail('Campaign not found',404)
    return service.preview(db,c)
@router.post('/campaigns/{identifier}/decision')
def decision(identifier:int,body:CampaignDecision,actor:User=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
    cap='approve' if body.action=='approve' else 'send'
    lock_actor(db,actor,session,'campaigns:'+cap)
    if 'campaigns:read' not in permissions(db,actor):service.fail('Campaign read permission required',403)
    result=service.decision(db,actor,identifier,body);db.commit();return result
@router.get('/campaigns/{identifier}/recipients')
def recipients(identifier:int,state:str=Query('',max_length=40),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor:User=Depends(mutation('campaigns:recipients')),db:Session=Depends(get_db)):
    query=db.query(Recipient).filter_by(campaign_id=identifier)
    if state:query=query.filter_by(state=state)
    rows=query.order_by(Recipient.id).offset(skip).limit(limit).all()
    result={'total':query.count(),'items':[{'id':r.id,'email':r.email_snapshot,'state':r.state,'attempts':r.attempts,'attempted_at':r.attempted_at,'reason':r.reason,'history':[{'state':e.state,'reason':e.reason,'recorded_at':e.recorded_at} for e in db.query(Delivery).filter_by(recipient_id=r.id).order_by(Delivery.id)]} for r in rows]}
    service.audit(db,actor,'campaign_recipient_details_viewed','campaigns',identifier);db.commit();return result
@router.post('/campaigns/recipients/{identifier}/retry')
def retry(identifier:int,body:CampaignRetry,actor:User=Depends(mutation('campaigns:send')),db:Session=Depends(get_db)):
    if 'campaigns:recipients' not in permissions(db,actor):service.fail('Recipient access permission required',403)
    result=service.retry(db,actor,identifier,body);db.commit();return result
