import json
from datetime import date
from typing import Literal
from fastapi import APIRouter,Depends,Query,Response
from pydantic import BaseModel,ConfigDict,Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.exceptions import APIError
from app.models.audit_event import AuditEvent
from app.security.auth import require
from app.routers.membership import protected,commit
from app.services import recurring_subscriptions as recurring,financial_reports as reports

router=APIRouter(prefix='/api/v1/financial',tags=['recurring subscriptions and financial reports'])


def office(code,admin=False):
    def check(actor=Depends(require(code))):
        if not actor.role or actor.role.name not in ({'administrator'} if admin else {'administrator','staff','finance'}):
            raise APIError(403,'forbidden','Authorised financial operator required')
        return actor
    return check


class Run(BaseModel):
    model_config=ConfigDict(extra='forbid')
    through:str|None=Field(None,pattern=r'^[0-9]{4}-(0[1-9]|1[0-2])$')


@router.get('/subscriptions/preview')
def preview(through:str|None=None,actor=Depends(office('subscriptions:generate',True)),db:Session=Depends(get_db)):
    return recurring.plan(db,through)


@router.post('/subscriptions/run',dependencies=[Depends(office('subscriptions:generate',True))])
def run(body:Run,actor=Depends(protected('subscriptions:generate')),db:Session=Depends(get_db)):
    result=recurring.generate(db,actor,body.through);commit(db);return result


@router.get('/reports')
def report(start:date,end:date,currency:str|None=Query(None,pattern=r'^[A-Z]{3}$'),category:str|None=Query(None,pattern=r'^(registration_payments|legacy_registration|subscription_obligations|subscription_payments|savings_ledger|savings_pending|withdrawal_debits|withdrawal_reservations)$'),
    skip:int=Query(0,ge=0),limit:int=Query(25,ge=1,le=100),export:bool=False,
    actor=Depends(office('reports:read')),db:Session=Depends(get_db)):
    if export:
        from app.security.auth import permissions
        if 'reports:export' not in permissions(db,actor):raise APIError(403,'forbidden','Separate report export permission required')
    result=reports.records(db,start,end,currency,category)
    if export:
        data=reports.csv_export(result)
        db.add(AuditEvent(event_type='financial_report',actor_user_id=actor.id,actor_email=actor.email,action='financial_report_exported',target_table='financial_reports',target_id='filtered_csv',details=json.dumps({'start':str(start),'end':str(end),'currency':currency,'category':category,'rows':result['total']})))
        commit(db)
        return Response(data,media_type='text/csv',headers={'Content-Disposition':'attachment; filename="financial-report.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    return {**result,'items':result['items'][skip:skip+limit],'skip':skip,'limit':limit}
