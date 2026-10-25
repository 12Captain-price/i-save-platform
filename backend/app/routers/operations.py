import json
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operations import OperationsPolicy, OperationsEvent, BackupJob
from app.routers.plan_drafts import access
from app.security.auth import current_session
from app.services.membership import lock_actor
from app.services import operations as service
from app.schemas.operations import PolicySave, Publication, Hold, Erase, Job

router=APIRouter(prefix='/api/v1/admin/operations',tags=['private document and recovery operations'])


def secured(db,actor,session,code):lock_actor(db,actor,session,code)


@router.get('')
def status(response:Response,actor=Depends(access('operations:read')),db:Session=Depends(get_db),skip:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    response.headers['Cache-Control']='no-store'
    version,terms=service.active(db)
    policies=db.query(OperationsPolicy).order_by(OperationsPolicy.id.desc()).limit(50).all()
    events=db.query(OperationsEvent).order_by(OperationsEvent.id.desc()).limit(100).all()
    jobs=db.query(BackupJob).order_by(BackupJob.id.desc()).offset(skip).limit(limit).all()
    from app.services.scanner import status as scanner_status
    return {'active_version':version,'active_terms':terms,'head_version':policies[0].id if policies else 0,
      'policies':[{'id':p.id,'base_version':p.base_version,'terms':json.loads(p.snapshot),'actor':p.actor_email,'at':p.recorded_at} for p in policies],
      'history':[{'id':e.id,'action':e.action,'target':e.target,'details':json.loads(e.snapshot),'actor':e.actor_email or 'Scheduled/operator process','at':e.recorded_at} for e in events],
      'holds':service.holds(db),'scopes':service.SCOPES,'scanner':scanner_status(),
      'jobs':[{'id':j.id,'kind':j.kind,'backup_id':j.backup_id,'state':j.state,'reason':j.reason,'checksum':j.checksum,'bytes':j.size,'actor':j.actor_email or 'System/operator process','at':j.recorded_at,'finished_at':j.finished_at} for j in jobs],
      'job_count':db.query(BackupJob).count(),
      'last_successful_backup':next(({'id':j.id,'at':j.finished_at} for j in db.query(BackupJob).filter_by(kind='backup',state='Succeeded').order_by(BackupJob.id.desc()).limit(1)),None),
      'last_successful_recovery_test':next(({'id':j.id,'at':j.finished_at} for j in db.query(BackupJob).filter_by(kind='restore-test',state='Succeeded').order_by(BackupJob.id.desc()).limit(1)),None),
      'unsupported':['Live restore through the application','Normal retention execution','Account deletion','Financial/audit deletion','Automatic archive disposal','Off-site backup (provider and credentials required)'],
      'backup_notice':'Encrypted local backups include PostgreSQL and its private document bytes. A local copy is not independent off-site protection. Worker, external key file, storage and isolated restore target must be configured.'}


@router.post('/draft')
def draft(body:PolicySave,actor=Depends(access('retention:draft')),session=Depends(current_session),db:Session=Depends(get_db)):
    secured(db,actor,session,'retention:draft');row=service.save(db,actor,body);db.commit();return {'version':row.id}


@router.post('/publish')
def publish(body:Publication,actor=Depends(access('retention:publish')),session=Depends(current_session),db:Session=Depends(get_db)):
    secured(db,actor,session,'retention:publish');service.publish(db,actor,body);db.commit();return {'published':True}


@router.post('/hold')
def hold(body:Hold,actor=Depends(access('retention:hold')),session=Depends(current_session),db:Session=Depends(get_db)):
    secured(db,actor,session,'retention:hold');service.hold(db,actor,body);db.commit();return {'saved':True}


@router.get('/retention-preview')
def preview(response:Response,actor=Depends(access('operations:read')),db:Session=Depends(get_db)):
    response.headers['Cache-Control']='no-store'
    return service.preview(db)


@router.post('/erase')
def erase(body:Erase,actor=Depends(access('retention:execute')),session=Depends(current_session),db:Session=Depends(get_db)):
    secured(db,actor,session,'retention:execute');service.erase(db,actor,body);db.commit();return {'completed':True}


@router.post('/jobs')
def jobs(body:Job,actor=Depends(access('operations:read')),session=Depends(current_session),db:Session=Depends(get_db)):
    secured(db,actor,session,'backups:run' if body.kind=='backup' else 'backups:restore-test');row=service.queue(db,actor,body);db.commit();return {'id':row.id,'state':row.state}
