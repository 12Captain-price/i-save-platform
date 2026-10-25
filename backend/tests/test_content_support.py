"""Authenticated editorial/support workflows; no normal data or credentials."""
from datetime import timedelta
from uuid import uuid4
import base64,io,json
from PIL import Image
import pytest
from app.models.content_support import ContentVersion,ContentEvent,SupportTicket,TicketMessage,TicketEvent,PublicMedia
from app.models.account_workflows import Notification
from app.models.auth import UserPermission
from app.models.permission import Permission
from app.security.auth import now
from app.services import content_support as service
from tests.test_auth import accounts,headers


@pytest.fixture
def actors(db,accounts):return {r:headers(db,u) for r,u in accounts.items()}

def save(client,h,kind='announcement',fields=None,**extra):
    return client.post('/api/v1/content',headers=h,json={'kind':kind,'fields':fields or {'title':'TEST ONLY announcement','body':'Synthetic approved text.'},'request_key':str(uuid4()),**extra})

def decide(client,h,row,action,**extra):
    return client.post(f'/api/v1/content/versions/{row["id"]}/decision',headers=h,json={'action':action,'base_event':row['base_event'],'request_key':str(uuid4()),'reason':'TEST ONLY editorial decision',**extra})

def publish(client,h,row,effective=None):
    for action in ['submit','approve','publish']:
        r=decide(client,h,row,action,**({'effective_at':(effective or now()).isoformat()} if action=='publish' else {}));assert r.status_code==200,r.text;row=r.json()
    return row

def create(client,h,**extra):return client.post('/api/v1/support',headers=h,json={'category':'Account','subject':'TEST ONLY support','message':'Synthetic help request. No private credentials.','request_key':str(uuid4()),**extra})
def act(client,h,row,action,**extra):return client.post(f'/api/v1/support/{row["id"]}',headers=h,json={'action':action,'base_revision':row['revision'],'request_key':str(uuid4()),**extra})


def test_published_version_preserved_while_new_draft_is_private(client,db,accounts,actors):
    h=actors['administrator'];r=save(client,h);assert r.status_code==200;row=r.json()
    assert client.get('/api/v1/public/content').json()['total']==0
    original=publish(client,h,row)
    assert client.get('/api/v1/public/content').json()['items'][0]['fields']['body']=='Synthetic approved text.'
    edit=save(client,h,item_id=row['item_id'],base_version=1,fields={'title':'SECRET DRAFT','body':'Not published'}).json()
    assert edit['state']=='Draft'
    assert client.get('/api/v1/public/content?q=SECRET').json()['total']==0
    assert client.get('/api/v1/public/content').json()['items'][0]['version']==1
    assert db.get(ContentVersion,row['id']).snapshot==json.dumps(original['fields'],sort_keys=True)
    assert client.get(f'/api/v1/content/versions/{edit["id"]}').status_code==401
    assert client.get(f'/api/v1/content/versions/{edit["id"]}',headers=actors['member']).status_code==403
    assert client.get(f'/api/v1/content/{row["item_id"]}/history',headers=h).json()['items'][0]['version']==2


@pytest.mark.parametrize('role',['member','finance','staff'])
def test_ungranted_office_content_denied(client,actors,role):
    assert save(client,actors[role]).status_code==403
    assert client.get('/api/v1/content',headers=actors[role]).status_code==403


def test_explicit_staff_drafting_does_not_grant_review_or_publication(client,db,accounts,actors):
    for code in ['content:read','content:draft']:
        db.add(UserPermission(user_id=accounts['staff'].id,permission_id=db.query(Permission).filter_by(code=code).one().id,allowed=True))
    db.commit();h=actors['staff'];row=save(client,h).json();row=decide(client,h,row,'submit').json()
    assert decide(client,h,row,'approve').status_code==403
    assert decide(client,h,row,'publish',effective_at=now().isoformat()).status_code==403
    assert client.get('/api/v1/public/content').json()['total']==0


@pytest.mark.parametrize('capability',['draft','review','publish'])
def test_editorial_actions_cannot_bypass_protected_read_permission(client,db,accounts,actors,capability):
    row=save(client,actors['administrator']).json()
    db.add(UserPermission(user_id=accounts['staff'].id,permission_id=db.query(Permission).filter_by(code='content:'+capability).one().id,allowed=True));db.commit()
    h=actors['staff']
    assert client.get(f'/api/v1/content/versions/{row["id"]}',headers=h).status_code==403
    response=save(client,h) if capability=='draft' else decide(client,h,row,'approve' if capability=='review' else 'publish')
    assert response.status_code==403


def test_changes_requested_approval_and_archive_are_versioned_events(client,db,actors):
    h=actors['administrator'];row=save(client,h).json();row=decide(client,h,row,'submit').json();row=decide(client,h,row,'request_changes').json()
    assert row['state']=='Changes requested'
    row=decide(client,h,row,'submit').json();row=decide(client,h,row,'approve').json();row=decide(client,h,row,'publish',effective_at=now().isoformat()).json()
    row=decide(client,h,row,'archive').json();assert row['state']=='Archived'
    assert client.get('/api/v1/public/content').json()['items']==[]
    assert len(row['history'])==6


def test_effective_publication_and_no_archived_fallback(client,db,actors,monkeypatch):
    h=actors['administrator'];clock=now();v1=publish(client,h,save(client,h).json(),clock-timedelta(minutes=1))
    v2=save(client,h,item_id=v1['item_id'],base_version=1,fields={'title':'Scheduled','body':'Future announcement'}).json()
    v2=publish(client,h,v2,clock+timedelta(days=1))
    assert client.get('/api/v1/public/content').json()['items'][0]['version']==1
    monkeypatch.setattr(service,'now',lambda:clock+timedelta(days=2))
    assert client.get('/api/v1/public/content').json()['items'][0]['version']==2
    assert decide(client,h,v2,'archive').status_code==200
    assert client.get('/api/v1/public/content').json()['total']==0


@pytest.mark.parametrize('kind',['organisation','faq','team','event','announcement'])
def test_incomplete_drafts_saved_but_not_approved(client,actors,kind):
    h=actors['administrator'];row=save(client,h,kind,fields={'title':'','body':''}).json();assert row['missing']
    row=decide(client,h,row,'submit').json();assert decide(client,h,row,'approve').status_code==400


@pytest.mark.parametrize('text',['<script>alert(1)</script>','javascript:alert(1)','data:text/html,bad','file:///private','bad\u0000text','https://localhost/recovery#token=private'])
def test_unsafe_content_and_private_links_rejected(client,actors,text):
    assert save(client,actors['administrator'],fields={'title':'Unsafe','body':text}).status_code==400


def test_event_timezone_dates_and_status_requirements(client,actors):
    h=actors['administrator']
    assert save(client,h,'event',fields={'title':'Test','body':'Test','starts_at':'2026-11-01T10:00'}).status_code==400
    row=save(client,h,'event',fields={'title':'TEST ONLY event','body':'Synthetic event','starts_at':'2026-11-01T10:00:00+02:00','ends_at':'2026-11-01T09:00:00+02:00','location':'TEST ONLY room','event_status':'Scheduled'}).json()
    row=decide(client,h,row,'submit').json();assert decide(client,h,row,'approve').status_code==400


def test_content_retry_conflict_and_actor_spoofing(client,db,actors):
    h=actors['administrator'];body={'kind':'faq','fields':{'title':'Test?','body':'Test answer'},'request_key':str(uuid4())}
    first=client.post('/api/v1/content',headers=h,json=body).json()
    assert client.post('/api/v1/content',headers=h,json=body).json()['id']==first['id']
    assert db.query(ContentVersion).count()==1
    assert client.post('/api/v1/content',headers=h,json={**body,'actor_id':1}).status_code==400
    edited=save(client,h,'faq',item_id=first['item_id'],base_version=1).json()
    assert save(client,h,'faq',item_id=first['item_id'],base_version=1).status_code==409
    assert decide(client,h,first,'submit').status_code==409


def image_body():
    buf=io.BytesIO();Image.new('RGB',(240,90),(0,150,100)).save(buf,format='PNG')
    return {'filename':'test-public.png','content_type':'image/png','data':base64.b64encode(buf.getvalue()).decode(),'alt':'TEST ONLY green public image','rights_confirmed':True,'rights_note':'Synthetic image created for testing; publication authorised.','request_key':str(uuid4())}


def test_public_media_scanned_separate_and_not_exposed_before_publication(client,db,actors,monkeypatch):
    monkeypatch.setattr('app.services.evidence.scan',lambda data:'TEST ONLY scanner')
    body=image_body();h=actors['administrator'];r=client.post('/api/v1/content/media',headers=h,json=body);assert r.status_code==200,r.text
    identifier=r.json()['id']
    assert client.get(f'/api/v1/public/content/media/{identifier}').status_code==404
    assert client.get(f'/api/v1/content/media/{identifier}').status_code==401
    assert client.get(f'/api/v1/content/media/{identifier}',headers=actors['member']).status_code==403
    row=save(client,h,fields={'title':'TEST ONLY image','body':'Approved synthetic image','media_id':identifier}).json();row=publish(client,h,row)
    response=client.get(f'/api/v1/public/content/media/{identifier}')
    assert response.status_code==200 and response.headers['content-type']=='image/png'
    assert response.headers['x-content-type-options']=='nosniff' and response.content.startswith(b'\x89PNG')
    assert decide(client,h,row,'archive').status_code==200
    assert client.get(f'/api/v1/public/content/media/{identifier}').status_code==404


def test_media_missing_rights_unsafe_file_and_scanner_fail_closed(client,actors,monkeypatch):
    h=actors['administrator'];body=image_body()
    assert client.post('/api/v1/content/media',headers=h,json={**body,'rights_confirmed':False}).status_code==400
    assert client.post('/api/v1/content/media',headers=h,json={**body,'filename':'../private.png'}).status_code==400
    from app.exceptions import APIError
    def unavailable(data):raise APIError(503,'scanner_unavailable','Unavailable')
    monkeypatch.setattr('app.services.evidence.scan',unavailable)
    assert client.post('/api/v1/content/media',headers=h,json=body).status_code==503


def test_member_ownership_internal_note_privacy_and_assignment(client,db,accounts,actors):
    row=create(client,actors['member']).json();identifier=row['id']
    assert client.get(f'/api/v1/support/{identifier}',headers=actors['other']).status_code==404
    assert client.get('/api/v1/support',headers=actors['other']).json()['items']==[]
    assert act(client,actors['other'],row,'reply',message='Foreign').status_code==404
    assert act(client,actors['member'],row,'internal_note',message='Forbidden').status_code==403
    assert client.get('/api/v1/support',headers=actors['staff']).status_code==403
    row=act(client,actors['administrator'],row,'internal_note',message='STAFF ONLY SECRET',reason='STAFF ONLY REASON').json()
    private=client.get(f'/api/v1/support/{identifier}',headers=actors['member'])
    assert 'STAFF ONLY' not in private.text and 'internal_note' not in private.text
    assert act(client,actors['administrator'],row,'assign',assignee_id=accounts['staff'].id,reason='No access').status_code==400
    row=act(client,actors['administrator'],row,'assign',assignee_id=accounts['administrator'].id,reason='Authorised queue').json()
    row=act(client,actors['administrator'],row,'reply',message='PUBLIC REPLY').json()
    own=client.get(f'/api/v1/support/{identifier}',headers=actors['member']).json()
    assert len(own['messages'])==2 and own['messages'][-1]['body']=='PUBLIC REPLY'
    assert own['assigned_to'] is None
    assert db.query(TicketMessage).count()==3


def test_ticket_retries_concurrency_conflicts_resolution_and_reopen(client,db,actors):
    h=actors['member'];key=str(uuid4());r=create(client,h,request_key=key);assert r.status_code==200,r.text
    row=r.json();assert create(client,h,request_key=key).json()['id']==row['id']
    response=act(client,actors['administrator'],row,'status',status='Waiting for member',reason='Need clarification');assert response.status_code==200
    assert act(client,h,row,'reply',message='Stale revision').status_code==409
    row=response.json();body={'action':'reply','base_revision':row['revision'],'message':'Member clarification','request_key':str(uuid4())}
    for _ in range(2):assert client.post(f'/api/v1/support/{row["id"]}',headers=h,json=body).status_code==200
    assert db.query(TicketMessage).count()==2
    row=client.get(f'/api/v1/support/{row["id"]}',headers=h).json()
    row=act(client,actors['administrator'],row,'status',status='Resolved',reason='Answer provided').json()
    assert act(client,h,row,'reply',message='Not yet').status_code==409
    row=act(client,h,row,'reopen',reason='More help needed').json();assert row['status']=='Open'
    assert len(row['history'])==5


def test_support_input_no_actors_or_attachments_and_notification_privacy(client,db,accounts,actors):
    assert create(client,actors['member'],actor_id=accounts['administrator'].id).status_code==400
    assert create(client,actors['member'],attachments=[]).status_code==400
    row=create(client,actors['member'],message='PRIVATE TICKET BODY').json()
    notifications=db.query(Notification).all();assert notifications and all('PRIVATE TICKET BODY' not in n.message for n in notifications)
    row=act(client,actors['administrator'],row,'reply',message='PRIVATE ANSWER').json()
    assert all('PRIVATE ANSWER' not in n.message for n in db.query(Notification))
    assert client.get('/api/v1/support').status_code==401
