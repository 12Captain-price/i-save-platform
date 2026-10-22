"""Real permission boundary, effective publications and immutable consumption."""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.models.audit_event import AuditEvent
from app.models.business_settings import BusinessSettingsVersion, BusinessSettingsPublication, ApplicationSettingsSnapshot, SubscriptionSettingsSnapshot
from app.models.application import MembershipApplication
from app.models.membership import ApplicationRegistrationPayment, MembershipApproval
from app.models.subscription import Subscription
from app.models.user import User
from app.services.business_settings import DEFAULTS, active
from app.security.auth import now
from tests.test_auth import accounts, headers
from tests.test_membership_workflow import pending, post, PAY, ACK

URL='/api/v1/admin/organisation-settings'


def save(client,auth,terms=None,base=0):
    body={'request_key':str(uuid4()),'base_version':base,'terms':dict(DEFAULTS) if terms is None else terms}
    return client.post(URL,headers=auth,json=body),body


def publish(client,auth,version,effective=None):
    body={'request_key':str(uuid4()),'version_id':version,'effective_at':effective}
    return client.post(URL+'/publish',headers=auth,json=body),body


@pytest.mark.parametrize('role',['staff','finance','member','other'])
def test_nonadmin_denied_despite_individual_grants(client,db,accounts,role):
    for code in ['settings:read','settings:write','settings:publish']:
        db.add(UserPermission(user_id=accounts[role].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();auth=headers(db,accounts[role])
    assert client.get(URL,headers=auth).status_code==403
    assert save(client,auth)[0].status_code==403
    assert publish(client,auth,1)[0].status_code==403


@pytest.mark.parametrize('code',['settings:read','settings:write','settings:publish'])
def test_each_admin_permission_is_required(client,db,accounts,code):
    db.add(UserPermission(user_id=accounts['administrator'].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=False));db.commit()
    auth=headers(db,accounts['administrator'])
    response=client.get(URL,headers=auth) if code=='settings:read' else save(client,auth)[0] if code=='settings:write' else publish(client,auth,1)[0]
    assert response.status_code==403


def test_incomplete_draft_isolated_history_conflicts_and_actor(client,db,accounts):
    auth=headers(db,accounts['administrator'])
    before=client.get('/api/v1/public/contacts').json()
    response,body=save(client,auth,{'office':'Proposed office'})
    assert response.status_code==201,response.text
    version=response.json()['version']
    assert response.json()['missing_decisions'] and response.json()['actor_email']==accounts['administrator'].email
    assert client.post(URL,headers=auth,json=body).json()==response.json()
    assert publish(client,auth,version)[0].status_code==400
    assert client.get('/api/v1/public/contacts').json()==before
    assert save(client,auth,base=0)[0].status_code==409
    assert client.post(URL,headers=auth,json={**body,'actor_id':123}).status_code==400
    assert client.post(URL,headers=auth,json={**body,'terms':{**body['terms'],'office':'Different'}}).status_code==409
    row,body2=save(client,auth,base=version)
    assert row.status_code==201
    history=client.get(URL,headers=auth).json()
    assert [v['version'] for v in history['versions']]==[row.json()['version'],version]
    assert history['versions'][1]['terms']['office']=='Proposed office'
    assert db.query(AuditEvent).filter_by(event_type='organisation_settings').count()==2
    assert db.query(BusinessSettingsPublication).count()==0


@pytest.mark.parametrize('patch',[
    {'registration_amount':'0'},{'subscription_amount':'-1'},{'subscription_amount':'1.001'},
    {'registration_currency':'usd'},{'subscription_due_day':29},{'subscription_due_day':0},
    {'subscription_due_day':1.5},{'subscription_start':'same_month'},{'email':'invalid'},
    {'office_phone':'javascript:alert(1)'},{'smtp_password':'secret'},{'enable_refunds':True},
])
def test_validation_and_no_fake_feature_or_secret_fields(client,db,accounts,patch):
    assert save(client,headers(db,accounts['administrator']),{**DEFAULTS,**patch})[0].status_code==400


def test_publication_effective_dates_exact_retry_and_preview(client,db,accounts):
    auth=headers(db,accounts['administrator'])
    proposed={**DEFAULTS,'office':'Synthetic approved future office'}
    response,_=save(client,auth,proposed);identifier=response.json()['version']
    state=client.get(URL,headers=auth).json()
    assert state['preview']['changes']['office']=={'from':DEFAULTS['office'],'to':proposed['office']}
    future=now()+timedelta(days=2)
    result,body=publish(client,auth,identifier,future.isoformat())
    assert result.status_code==200,result.text
    assert client.post(URL+'/publish',headers=auth,json=body).json()==result.json()
    assert client.post(URL+'/publish',headers=auth,json={**body,'effective_at':None}).status_code==409
    assert active(db)[1]['office']==DEFAULTS['office']
    assert active(db,at=future+timedelta(seconds=1))[1]['office']==proposed['office']
    assert client.get('/api/v1/public/contacts').json()['office']==DEFAULTS['office']
    second,_=save(client,auth,base=identifier)
    assert publish(client,auth,second.json()['version'])[0].status_code==409
    assert publish(client,auth,second.json()['version'],(now()-timedelta(days=1)).isoformat())[0].status_code==400
    assert publish(client,auth,second.json()['version'],'2030-01-01T12:00:00')[0].status_code==400
    assert db.query(AuditEvent).filter_by(action='organisation_settings_published').count()==1


def test_fee_change_requires_updated_review_wording(client,db,accounts):
    auth=headers(db,accounts['administrator'])
    row,_=save(client,auth,{**DEFAULTS,'registration_amount':'30.00'})
    assert publish(client,auth,row.json()['version'])[0].status_code==400


def test_scheduled_fee_is_consumed_only_after_effective_time(client,db,accounts,pending,monkeypatch):
    auth=headers(db,accounts['administrator'])
    future=now()+timedelta(days=2)
    proposed={**DEFAULTS,'registration_amount':'31.00','registration_currency':'GBP','review_acknowledgement':'Review the verified GBP 31 fee; activation remains separate.'}
    row,_=save(client,auth,proposed)
    assert publish(client,auth,row.json()['version'],future.isoformat())[0].status_code==200
    assert post(client,auth,pending,'payment',PAY).status_code==200
    monkeypatch.setattr('app.services.business_settings.now',lambda:future+timedelta(seconds=1))
    after=MembershipApplication(application_number='after-effective',first_name='Future',last_name='Synthetic',email='after-effective@example.test',status='Pending')
    db.add(after);db.commit()
    assert post(client,auth,after,'payment',{**PAY,'reference':'after-effective-receipt'}).status_code==400
    assert post(client,auth,after,'payment',{**PAY,'amount':'31.00','currency':'GBP','reference':'after-effective-receipt'}).status_code==200
    assert post(client,auth,pending,'verify').status_code==200  # Earlier fee is still USD 20.
    assert post(client,auth,after,'verify').status_code==200
    assert db.get(ApplicationSettingsSnapshot,after.id).version_id==row.json()['version']


def test_workflow_consumes_published_values_and_preserves_old_payments(client,db,accounts,pending):
    auth=headers(db,accounts['administrator'])
    # Baseline payment exists before publication, without rewriting its row.
    assert post(client,auth,pending,'payment',PAY).status_code==200
    original=db.get(ApplicationRegistrationPayment,pending.id)
    original_values=(original.amount,original.currency,original.reference,original.recorded_at)
    changed={**DEFAULTS,'office':'Synthetic published office','registration_amount':'30.00','registration_currency':'EUR',
        'subscription_amount':'7.50','subscription_currency':'EUR','subscription_due_day':7,
        'review_acknowledgement':'I reviewed the application and verified EUR 30 fee. Approval is separate from activation.'}
    row,_=save(client,auth,changed);version=row.json()['version']
    assert publish(client,auth,version)[0].status_code==200
    assert client.get('/api/v1/public/contacts').json()['office']==changed['office']
    assert set(client.get('/api/v1/public/contacts').json())=={'version','office','email','office_phone','director_phone','additional_phone'}
    assert post(client,auth,pending,'verify').status_code==200
    assert post(client,auth,pending,'approve',ACK).status_code==200
    assert post(client,auth,pending,'activate').status_code==200
    assert original_values==(original.amount,original.currency,original.reference,original.recorded_at)
    fresh=MembershipApplication(application_number='settings-fresh',first_name='Synthetic',last_name='Settings',email='settings-fresh@example.test',status='Pending')
    db.add(fresh);db.commit()
    assert post(client,auth,fresh,'payment',{**PAY,'reference':'new-settings-receipt'}).status_code==400
    assert post(client,auth,fresh,'payment',{**PAY,'amount':'30.00','currency':'EUR','reference':'new-settings-receipt'}).status_code==200
    assert db.get(ApplicationSettingsSnapshot,fresh.id).version_id==version
    state=client.get(f'/api/v1/membership/applications/{fresh.id}',headers=auth).json()
    ack={'acknowledged':True,'acknowledgement_version':state['acknowledgement']['acknowledgement_version']}
    # A later publication cannot redefine this payment or its acknowledgement.
    newer={**changed,'registration_amount':'40.00','review_acknowledgement':'New future fee review wording.'}
    next_row,_=save(client,auth,newer,version)
    assert publish(client,auth,next_row.json()['version'])[0].status_code==200
    old_approval=db.get(MembershipApproval,pending.id)
    old_fees=client.get('/api/v1/membership/fees',headers=headers(db,db.get(User,old_approval.user_id),token='preserved-old-fee-session')).json()
    assert old_fees['registration_fees'][0]['amount']=='20.00' and old_fees['registration_fees'][0]['currency']=='USD'
    assert post(client,auth,fresh,'verify').status_code==200
    assert post(client,auth,fresh,'approve',ACK).status_code==400
    assert post(client,auth,fresh,'approve',ack).status_code==200
    assert post(client,auth,fresh,'activate').status_code==200
    approval=db.get(MembershipApproval,fresh.id)
    assert approval.acknowledgement_text==changed['review_acknowledgement']
    subscription=db.query(Subscription).filter_by(member_id=approval.member_id).one()
    assert subscription.amount==Decimal('7.50') and subscription.currency=='EUR' and subscription.due_date.day==7
    assert db.get(SubscriptionSettingsSnapshot,subscription.id).version_id==next_row.json()['version']
    assert client.get(f'/api/v1/membership/applications/{fresh.id}',headers=auth).json()['subscription_due_day']==7
    member_auth=headers(db,db.get(User,approval.user_id))
    fees=client.get('/api/v1/membership/fees',headers=member_auth).json()
    overview=client.get('/api/v1/membership/overview',headers=member_auth).json()
    assert overview['fees']==fees and overview['registration_fee_verified'] is True
    assert overview['subscription_due_day']==7
    assert fees['registration_fees'][0]['amount']=='30.00' and fees['registration_fees'][0]['currency']=='EUR'
    assert fees['subscriptions'][0]['due_date'].endswith('-07')
    assert overview['savings']['available'] is True
