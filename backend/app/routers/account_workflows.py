"""Protected staff administration and recipient-owned notifications."""
from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.role import Role
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.account_workflows import AccountLink, Notification
from app.security.auth import current_user, current_session, require, permissions, PERMISSIONS, digest, validate_session
from app.services import account_workflows as service, access
from app.services.auth import throttle
from app.schemas.common import Email
from app.schemas.membership import PasswordSetup
from app.exceptions import APIError

router=APIRouter(prefix='/api/v1',tags=['account administration'])


class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Invite(Strict):
    email: Email
    role: Literal['staff','finance']
    request_key: UUID

class Replace(Strict):
    request_key: UUID

class Recovery(Strict):
    email: Email
    request_key: UUID

class Read(Strict):
    read: bool = Field(strict=True)

class Status(Strict):
    active: bool = Field(strict=True)

class Override(Strict):
    allowed: bool | None = Field(strict=True)


@router.put('/admin/staff/{identifier}/status')
def status(identifier:int,body:Status,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    user=db.get(User,identifier)
    if not user or not user.role or user.role.name not in {'administrator','staff','finance'}:raise APIError(404,'not_found','Staff not found')
    from app.schemas.user import UserUpdate
    access.update_user(db,actor,identifier,UserUpdate(is_active=body.active))
    return {'active':body.active}


@router.put('/admin/staff/{identifier}/permissions/{code}')
def override(identifier:int,code:str,body:Override,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    user=db.get(User,identifier)
    if not user or not user.role or user.role.name not in {'staff','finance'}:raise APIError(403,'forbidden','Operational staff account required')
    access.override_permission(db,actor,identifier,code,body.allowed)
    return {'permissions':sorted(permissions(db,user))}


def security(db,actor,session):
    access.guard(db,actor)
    db.refresh(session);validate_session(session)


@router.get('/admin/staff')
def staff(q:str=Query('',max_length=100),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),
          actor:User=Depends(require('users:read')),db:Session=Depends(get_db)):
    access.guard(db,actor)
    query=db.query(User).join(Role).filter(Role.name.in_(['administrator','staff','finance']))
    if q:query=query.filter(User.email.ilike('%'+q.replace('%','\\%').replace('_','\\_')+'%',escape='\\'))
    items=[]
    for user in query.order_by(User.id).offset(skip).limit(limit):
        overrides=db.query(Permission.code,UserPermission.allowed).join(UserPermission,UserPermission.permission_id==Permission.id).filter(UserPermission.user_id==user.id).all()
        links=db.query(AccountLink).filter_by(user_id=user.id).order_by(AccountLink.issued_at.desc()).all()
        items.append({'id':user.id,'email':user.email,'role':user.role.name,'status':'Suspended' if not user.is_active else 'Active' if user.password_hash else 'Invited',
                      'permissions':sorted(permissions(db,user)),'overrides':dict(overrides),'invitations':[service.link_status(r) for r in links]})
    return {'items':items,'total':query.count(),'skip':skip,'limit':limit}


@router.get('/admin/capabilities')
def capabilities(actor:User=Depends(require('users:read')),db:Session=Depends(get_db)):
    access.guard(db,actor)
    effective=permissions(db,actor)
    actions={'read':'View','write':'Manage','own':'View your own','record':'Record','verify':'Verify','reconcile':'Reconcile','reverse':'Reverse with linked history','assist':'Assist submission of','approve':'Approve','activate':'Activate','issue':'Issue','generate':'Generate','export':'Export','publish':'Publish','view':'View private','replace':'Replace','review':'Review','extra':'Authorise extra'}
    return [{'code':code,'description':actions.get(code.split(':')[-1],code.split(':')[-1].capitalize())+' '+code.rsplit(':',1)[0].replace(':',' ').replace('-',' ')+' records',
             'held':code in effective,'delegable':code in effective and code not in {'users:write','roles:write'} and not code.endswith(':own')}
            for code in sorted(PERMISSIONS)]


@router.post('/admin/staff/invitations')
def invite(body:Invite,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    return service.invite_staff(db,actor,body)


@router.post('/admin/staff/{identifier}/invitation')
def replace(identifier:int,body:Replace,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    user=db.get(User,identifier)
    if not user or not user.role or user.role.name not in {'staff','finance'}:raise APIError(404,'not_found','Staff account not found')
    if not permissions(db,user)<=permissions(db,actor):raise APIError(403,'forbidden','Account access exceeds your authority')
    row,token=service.issue(db,user,'staff',body.request_key,actor)
    service.deliver_link(db,row,token)
    return service.link_status(row)


@router.post('/auth/recovery',status_code=202)
def recovery(body:Recovery,request:Request,db:Session=Depends(get_db)):
    from app.config import get_settings
    if get_settings().app_env=='production' and request.url.scheme!='https':raise APIError(400,'https_required','HTTPS required')
    throttle(db,digest('recovery-ip:'+(request.client.host if request.client else 'unknown')))
    throttle(db,digest('recovery-account:'+body.email.strip().lower()))
    service.enqueue_recovery(db,body.email,body.request_key)
    return {'message':'If recovery is available for this account, a private link will be prepared. Contact the office if you need help. No delivery is guaranteed.'}


@router.post('/auth/reset-password',status_code=204)
def reset(body:PasswordSetup,request:Request,db:Session=Depends(get_db)):
    from app.config import get_settings
    if get_settings().app_env=='production' and request.url.scheme!='https':raise APIError(400,'https_required','HTTPS required')
    throttle(db,digest('reset-ip:'+(request.client.host if request.client else 'unknown')))
    throttle(db,digest('reset-token:'+body.token))
    service.consume(db,body.token,body.password,'recovery')
    return Response(status_code=204)


def available_link(db,user,row):
    codes=permissions(db,user)
    required={'contributions':'savings:own','withdrawals':'withdrawals:own','applications':'applications:own'}
    if user.role and user.role.name=='member' and required.get(row.screen) in codes:return '/portal/member/'+row.screen
    if row.screen=='dashboard' and user.role:
        role={'administrator':'admin','staff':'staff','finance':'finance','member':'member'}.get(user.role.name)
        if role:return '/portal/'+role+'/dashboard'
    return None


@router.get('/notifications')
def notifications(skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),user:User=Depends(current_user),db:Session=Depends(get_db)):
    query=db.query(Notification).filter_by(user_id=user.id)
    return {'unread':query.filter_by(read=False).count(),'total':query.count(),
        'items':[{'id':r.id,'message':r.message,'read':r.read,'created_at':r.created_at,'link':available_link(db,user,r)} for r in query.order_by(Notification.id.desc()).offset(skip).limit(limit)]}


@router.put('/notifications/{identifier}')
def mark(identifier:int,body:Read,user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=db.query(Notification).filter_by(id=identifier,user_id=user.id).one_or_none()
    if not row:raise APIError(404,'not_found','Notification not found')
    row.read=body.read;db.commit();return {'read':row.read}


@router.get('/admin/notification-deliveries')
def deliveries(skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),actor:User=Depends(require('users:read')),db:Session=Depends(get_db)):
    access.guard(db,actor)
    query=db.query(Notification)
    links=db.query(AccountLink)
    return {'total':query.count(),'items':[{'id':r.id,'state':r.delivery_state,'attempts':r.delivery_attempts,'created_at':r.created_at} for r in query.order_by(Notification.id.desc()).offset(skip).limit(limit)],
        'link_total':links.count(),'links':[{'request_key':r.request_key,'user_id':r.user_id,**service.link_status(r)} for r in links.order_by(AccountLink.issued_at.desc()).offset(skip).limit(limit)]}


@router.post('/admin/account-links/{key}/replace')
def replace_link(key:UUID,body:Replace,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    old=db.query(AccountLink).filter_by(request_key=str(key)).one_or_none()
    if not old:raise APIError(404,'not_found','Delivery record not found')
    user=db.get(User,old.user_id)
    if not permissions(db,user)<=permissions(db,actor):raise APIError(403,'forbidden','Recipient access exceeds your authority')
    row,token=service.issue(db,user,old.purpose,body.request_key,actor)
    service.deliver_link(db,row,token)
    return service.link_status(row)


@router.post('/admin/notification-deliveries/{identifier}/retry')
def retry(identifier:int,actor:User=Depends(require('users:write')),session=Depends(current_session),db:Session=Depends(get_db)):
    security(db,actor,session)
    row=db.get(Notification,identifier)
    if not row:raise APIError(404,'not_found','Notification not found')
    service.send_notice(db,actor,row)
    return {'state':row.delivery_state}
