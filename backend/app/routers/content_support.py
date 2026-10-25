"""Effective public content, protected editorial previews and owned support."""
from fastapi import APIRouter,Depends,Query,Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.content_support import ContentItem,ContentVersion,PublicMedia,SupportTicket
from app.schemas.content_support import SaveContent,ContentDecision,MediaUpload,CreateTicket,TicketAction,Kind
from app.security.auth import require,current_user,current_session,permissions
from app.services.membership import lock_actor
from app.services import content_support as service

router=APIRouter(prefix='/api/v1',tags=['content and support'])


def mutation(code):
    def dependency(actor:User=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
        lock_actor(db,actor,session,code)
        if code.startswith('content:') and 'content:read' not in permissions(db,actor):service.fail('Protected content read permission required',403)
        return actor
    return dependency


@router.get('/public/content')
def public_content(kind:Kind|None=None,q:str=Query('',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),db:Session=Depends(get_db)):
    items=service.public_items(db,kind)
    if q:items=[r for r in items if q.casefold() in (r['fields']['title']+' '+r['fields']['body']).casefold()]
    return {'items':items[skip:skip+limit],'total':len(items)}


@router.get('/content')
def content(kind:Kind|None=None,q:str=Query('',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor:User=Depends(require('content:read')),db:Session=Depends(get_db)):
    query=db.query(ContentVersion).join(ContentItem).filter(ContentVersion.version==ContentItem.latest_version)
    if kind:query=query.filter(ContentItem.kind==kind)
    if q:query=query.filter(ContentVersion.snapshot.icontains(q,autoescape=True))
    return {'total':query.count(),'items':[service.content_present(db,v) for v in query.order_by(ContentVersion.id.desc()).offset(skip).limit(limit)],'scanning_available':__import__('app.services.evidence',fromlist=['scan_available']).scan_available()}


@router.post('/content')
def save(body:SaveContent,actor:User=Depends(mutation('content:draft')),db:Session=Depends(get_db)):
    result=service.save_content(db,actor,body);db.commit();return result


@router.get('/content/versions/{identifier}')
def preview(identifier:int,actor:User=Depends(require('content:read')),db:Session=Depends(get_db)):
    v=db.get(ContentVersion,identifier)
    if not v:service.fail('Version not found',404)
    return service.content_present(db,v)


@router.get('/content/{identifier}/history')
def history(identifier:int,actor:User=Depends(require('content:read')),db:Session=Depends(get_db)):
    return {'items':[service.content_present(db,v) for v in db.query(ContentVersion).filter_by(item_id=identifier).order_by(ContentVersion.version.desc()).limit(100)]}


@router.post('/content/versions/{identifier}/decision')
def decision(identifier:int,body:ContentDecision,actor:User=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
    cap={'submit':'draft','request_changes':'review','approve':'review','publish':'publish','archive':'archive'}[body.action]
    lock_actor(db,actor,session,'content:'+cap)
    if 'content:read' not in permissions(db,actor):service.fail('Protected content read permission required',403)
    result=service.content_decision(db,actor,identifier,body);db.commit();return result


@router.post('/content/media')
def upload(body:MediaUpload,actor:User=Depends(mutation('content:draft')),db:Session=Depends(get_db)):
    result=service.upload_media(db,actor,body);db.commit();return result


def media_response(row):
    return Response(row.content,media_type=row.content_type,headers={'Content-Disposition':f'inline; filename="public-media-{row.id}.png"','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'})


@router.get('/content/media/{identifier}')
def private_media(identifier:int,actor:User=Depends(require('content:read')),db:Session=Depends(get_db)):
    row=db.get(PublicMedia,identifier)
    if not row:service.fail('Public-media asset not found',404)
    return media_response(row)


@router.get('/public/content/media/{identifier}')
def public_media(identifier:int,db:Session=Depends(get_db)):
    if not any(r['media'] and r['media']['id']==identifier for r in service.public_items(db)):service.fail('Published image not found',404)
    row=db.get(PublicMedia,identifier)
    if not row:service.fail('Published image not found',404)
    return media_response(row)


@router.get('/support/assignees')
def assignees(actor:User=Depends(require('support:assign')),db:Session=Depends(get_db)):
    return [{'id':u.id,'email':u.email} for u in service.office_recipients(db,'support:read')]


@router.get('/support')
def tickets(q:str=Query('',max_length=100),status:str=Query('',max_length=30),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor:User=Depends(current_user),db:Session=Depends(get_db)):
    query=service.ticket_query(db,actor)
    if q:
        from sqlalchemy import or_
        query=query.filter(or_(SupportTicket.subject.icontains(q,autoescape=True),SupportTicket.number.icontains(q,autoescape=True)))
    if status:query=query.filter_by(status=status)
    return {'total':query.count(),'items':[{'id':r.id,'number':r.number,'subject':r.subject,'category':r.category,'status':r.status,'revision':r.revision,'created_at':r.created_at} for r in query.order_by(SupportTicket.id.desc()).offset(skip).limit(limit)]}


@router.post('/support')
def create_ticket(body:CreateTicket,actor:User=Depends(mutation('support:own')),db:Session=Depends(get_db)):
    result=service.create_ticket(db,actor,body);db.commit();return result


@router.get('/support/{identifier}')
def ticket(identifier:int,actor:User=Depends(current_user),db:Session=Depends(get_db)):
    row=service.ticket_query(db,actor).filter_by(id=identifier).one_or_none()
    if not row:service.fail('Ticket not found',404)
    return service.ticket_present(db,actor,row)


@router.post('/support/{identifier}')
def action(identifier:int,body:TicketAction,actor:User=Depends(current_user),session=Depends(current_session),db:Session=Depends(get_db)):
    cap='support:own' if actor.role and actor.role.name=='member' else 'support:'+{'reply':'reply','internal_note':'internal','assign':'assign','status':'resolve','reopen':'reply'}[body.action]
    lock_actor(db,actor,session,cap)
    result=service.ticket_action(db,actor,identifier,body);db.commit();return result
