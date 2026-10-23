"""Published terms and owned plan applications. Never posts financial records."""
import calendar
import json
from zoneinfo import ZoneInfo
from sqlalchemy import select
from app.exceptions import APIError
from app.models.plan_draft import PlanDraft, PlanDraftVersion as Version
from app.models.evidence_enrolment import PlanApproval, PlanPublication, PlanApplication, PlanEnrolment, PlanApplicationEvent
from app.models.membership import MembershipApproval
from app.models.member import Member
from app.models.audit_event import AuditEvent
from app.schemas.plan_draft import DraftTerms
from app.schemas.enrolment import ACK_TEXT, ACK_VERSION, WITHDRAWAL_TEXT, MISSED_TEXT
from app.security.auth import now, aware, permissions
from app.services.membership import advisory


def blockers(terms):
    missing = ['Missing decision: '+key.replace('_',' ') for key in terms.missing()]
    required = {'contribution_mode':'member_chosen', 'cadence':'weekly', 'duration_mode':'calendar_months', 'duration_months':8,
        'missed_target_policy':'no_automatic_consequences', 'extra_contribution_policy':'voluntary_no_automatic_posting',
        'withdrawal_access':'after_completion_14_days_notice_review_unavailable', 'benefits_policy':'unavailable'}
    for key, expected in required.items():
        if getattr(terms,key) != expected: missing.append('Publication requires '+key.replace('_',' ')+': '+str(expected))
    if terms.currency not in {'USD','ZWG'}:missing.append('Choose USD or ZiG (ZWG), recorded separately')
    if terms.fixed_amount is not None or terms.duration_weeks is not None:missing.append('Fixed amounts/week-count durations are unsupported for publication')
    return missing


def audit(db, actor, action, table, identifier, details=None):
    db.add(AuditEvent(event_type='plan_enrolment',actor_user_id=actor.id,actor_email=actor.email,action=action,target_table=table,target_id=str(identifier),details=json.dumps(details) if details else None))


def preview(db, row):
    approved = db.get(PlanApproval,row.id); published = db.get(PlanPublication,row.id)
    return {'version_id':row.id,'blockers':blockers(DraftTerms.model_validate_json(row.snapshot)),
        'approved_by':approved.actor_email if approved else None,'approved_at':approved.recorded_at if approved else None,
        'published_by':published.actor_email if published else None,'effective_at':published.effective_at if published else None,
        'withdrawal_access':WITHDRAWAL_TEXT,'missed_target_policy':MISSED_TEXT,
        'impact':'Publication affects new plan applications only. Existing accepted terms, enrolments, payments and balances are unchanged.'}


def publish_action(db, actor, draft_id, action, body):
    advisory(db,'plan-publication:'+str(draft_id))
    draft = db.execute(select(PlanDraft).where(PlanDraft.id==draft_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not draft:raise APIError(404,'not_found','Draft not found')
    row = db.query(Version).filter_by(draft_id=draft_id,version=body.version).one_or_none()
    if not row:raise APIError(404,'not_found','Draft version not found')
    model = PlanApproval if action=='approve' else PlanPublication
    old = db.query(model).filter_by(request_key=str(body.request_key)).one_or_none()
    requested = json.dumps({'version':body.version,'effective_at':body.effective_at.isoformat() if body.effective_at else None},sort_keys=True)
    if old:
        if old.version_id != row.id or (action=='publish' and old.request_snapshot!=requested):raise APIError(409,'conflict','Request key reused')
        return preview(db,row)
    if draft.latest_version != body.version:raise APIError(409,'conflict','A newer draft exists. Reload the preview')
    reasons = blockers(DraftTerms.model_validate_json(row.snapshot))
    if reasons:raise APIError(400,'incomplete_terms','; '.join(reasons))
    if db.get(model,row.id):raise APIError(409,'conflict','This version already completed this action; refresh')
    if action=='approve':
        if body.effective_at is not None:raise APIError(400,'bad_request','Effective date belongs to publication')
        db.add(PlanApproval(version_id=row.id,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key)))
    else:
        if not db.get(PlanApproval,row.id):raise APIError(409,'prerequisite_missing','Explicit terms approval is required before publication')
        effective = body.effective_at or now()
        if body.effective_at and effective < now():raise APIError(400,'bad_effective_date','Publication cannot be backdated')
        last = db.query(PlanPublication).join(Version,Version.id==PlanPublication.version_id).filter(Version.draft_id==draft_id).order_by(PlanPublication.effective_at.desc()).first()
        if last and effective <= aware(last.effective_at):raise APIError(409,'conflict','Effective date must follow previous publication')
        db.add(PlanPublication(version_id=row.id,effective_at=effective,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key),request_snapshot=requested))
    audit(db,actor,'plan_terms_'+('approved' if action=='approve' else 'published'),'plan_draft_versions',row.id)
    db.flush()
    return preview(db,row)


def offers(db, category=None):
    query = db.query(Version).join(PlanPublication,PlanPublication.version_id==Version.id).filter(PlanPublication.effective_at<=now()).order_by(PlanPublication.effective_at.desc(),Version.id.desc())
    seen=set();rows=[]
    for row in query:
        if row.draft_id in seen:continue
        seen.add(row.draft_id)
        terms=DraftTerms.model_validate_json(row.snapshot)
        if blockers(terms) or (category and terms.category!=category):continue
        rows.append({'draft_id':row.draft_id,'version_id':row.id,'version':row.version,'terms':terms.model_dump(mode='json'),
            'acknowledgement':ACK_TEXT,'acknowledgement_version':ACK_VERSION,'withdrawal_access':WITHDRAWAL_TEXT,'missed_target_policy':MISSED_TEXT,
            'notice':'Application and enrolment do not record payment or increase savings. USD and ZiG are separate; no savings conversion. Benefits and returns are unavailable.'})
    return rows


def owned_member(db, actor):
    if not actor.role or actor.role.name!='member' or 'plans:own' not in permissions(db,actor):raise APIError(403,'forbidden','Member plan access required')
    member = db.query(Member).filter_by(user_id=actor.id).one_or_none()
    return member


def apply(db, actor, body):
    member=owned_member(db,actor)
    if not member:raise APIError(409,'prerequisite_missing','An activated membership is required')
    approval=db.query(MembershipApproval).filter_by(member_id=member.id,user_id=actor.id).one_or_none()
    if not approval or not approval.activated_at:raise APIError(409,'prerequisite_missing','Membership activation must be confirmed first')
    advisory(db,'member-plan-application:'+str(member.id))
    old_key=db.query(PlanApplication).filter_by(request_key=str(body.request_key)).one_or_none()
    if old_key:
        if old_key.member_id!=member.id or old_key.version_id!=body.version_id or old_key.weekly_target!=body.weekly_target:raise APIError(409,'conflict','Request key reused')
        return present_application(db,old_key)
    offer=next((o for o in offers(db) if o['version_id']==body.version_id),None)
    if not offer:raise APIError(409,'unavailable_plan','This plan version is not currently offered. Reload the terms')
    terms=DraftTerms.model_validate(offer['terms'])
    if (terms.minimum_amount is not None and body.weekly_target<terms.minimum_amount) or (terms.maximum_amount is not None and body.weekly_target>terms.maximum_amount):raise APIError(400,'invalid_target','Weekly target must fit the published limits')
    old=db.query(PlanApplication).filter_by(member_id=member.id,draft_id=offer['draft_id']).one_or_none()
    if old:
        if old.version_id==body.version_id and old.weekly_target==body.weekly_target:return present_application(db,old)
        raise APIError(409,'duplicate_application','An application for this plan already exists. Review your recorded applications')
    row=PlanApplication(member_id=member.id,draft_id=offer['draft_id'],version_id=body.version_id,terms_snapshot=json.dumps(offer,sort_keys=True),
        weekly_target=body.weekly_target,currency=terms.currency,acknowledgement_text=ACK_TEXT,acknowledged_at=now(),actor_id=actor.id,request_key=str(body.request_key),status='Pending')
    db.add(row);db.flush();record_event(db,actor,row,'Pending','Member applied after acknowledging displayed terms '+ACK_VERSION+'.')
    return present_application(db,row)


def present_application(db,row):
    enrolment=db.get(PlanEnrolment,row.id)
    accepted=json.loads(row.terms_snapshot)
    return {'id':row.id,'member_id':row.member_id,'version_id':row.version_id,'terms':accepted['terms'],'weekly_target':str(row.weekly_target),
        'currency':row.currency,'status':row.status,'acknowledgement':row.acknowledgement_text,'acknowledgement_version':accepted['acknowledgement_version'],'acknowledged_at':row.acknowledged_at,
        'enrolment':None if not enrolment else {'activated_at':enrolment.activated_at,'start_date':enrolment.start_date,'end_date':enrolment.end_date,'activated_by':enrolment.actor_email},
        'withdrawal_access':accepted['withdrawal_access'],'missed_target_policy':accepted['missed_target_policy'],'notice':accepted['notice'],
        'history':[{'status':e.status,'reason':e.reason,'actor':e.actor_email,'recorded_at':e.recorded_at} for e in db.query(PlanApplicationEvent).filter_by(application_id=row.id).order_by(PlanApplicationEvent.id)]}


def record_event(db,actor,row,status,reason):
    event=PlanApplicationEvent(application_id=row.id,status=status,reason=reason,actor_id=actor.id,actor_email=actor.email)
    db.add(event)
    audit(db,actor,'plan_application_'+status.lower(),'plan_applications',row.id)
    db.flush()
    from app.services.account_workflows import member_notice
    member_notice(db,row.member_id,'plan-application-event:'+str(event.id),'Plan application status: '+status+'. Plan approval does not create a payment or savings credit.','applications')


def lock(db,identifier):
    row=db.execute(select(PlanApplication).where(PlanApplication.id==identifier).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
    if not row:raise APIError(404,'not_found','Plan application not found')
    return row


def decide(db,actor,identifier,body):
    row=lock(db,identifier)
    latest=db.query(PlanApplicationEvent).filter_by(application_id=identifier).order_by(PlanApplicationEvent.id.desc()).first()
    if row.status==body.outcome and latest and latest.actor_id==actor.id and latest.reason==body.reason:return present_application(db,row)
    if row.status!=body.base_status or row.status!='Pending':raise APIError(409,'conflict','Plan application changed; reload')
    row.status=body.outcome;record_event(db,actor,row,row.status,body.reason)
    return present_application(db,row)


def end_date(start):
    month_index=start.year*12+start.month-1+8
    year,month=divmod(month_index,12);month+=1
    return start.replace(year=year,month=month,day=min(start.day,calendar.monthrange(year,month)[1]))


def activate(db,actor,identifier):
    row=lock(db,identifier)
    if db.get(PlanEnrolment,identifier):return present_application(db,row)
    if row.status!='Approved':raise APIError(409,'prerequisite_missing','Approve the plan application first')
    membership=db.query(MembershipApproval).filter_by(member_id=row.member_id).one_or_none()
    if not membership or not membership.activated_at:raise APIError(409,'prerequisite_missing','Activated membership is required')
    timestamp=now();start=timestamp.astimezone(ZoneInfo('Africa/Harare')).date()
    db.add(PlanEnrolment(application_id=row.id,activated_at=timestamp,start_date=start,end_date=end_date(start),actor_id=actor.id,actor_email=actor.email))
    row.status='Active';record_event(db,actor,row,'Active','Enrolment activated for eight calendar months. No payment, savings posting, withdrawal processing or penalties created.')
    db.flush();return present_application(db,row)
