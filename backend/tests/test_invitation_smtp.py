"""Development SMTP configuration, payload privacy and capture-only boundary."""
from uuid import uuid4
import pytest
from app.config import Settings
from app.services import invitation_delivery as delivery

@pytest.mark.parametrize('changes',[
    {'app_env':'production'},{'app_env':'staging'}, {'invitation_delivery':'disabled'},
    {'smtp_host':'smtp.external.example'}, {'password_setup_frontend_url':'https://outside.example'},
    {'password_setup_frontend_url':'http://localhost:3000/redirect'},
    {'password_setup_frontend_url':'http://attacker@localhost:3000'},
    {'password_setup_frontend_url':'http://localhost:3000?next=external'},
    {'smtp_from':'actual@gmail.com'},
    {'password_setup_frontend_url':'http://localhost:invalid'},
    {'password_setup_frontend_url':'http://[broken'},
])
def test_local_adapter_fails_closed(monkeypatch,changes):
    settings=Settings(_env_file=None,app_env='development',invitation_delivery='mailpit').model_copy(update=changes)
    monkeypatch.setattr(delivery,'get_settings',lambda:settings)
    assert not delivery.get_invitation_mailer().available

def test_local_smtp_message_and_proof_do_not_expose_link_in_api_evidence(monkeypatch,capsys):
    captured={}
    class SMTP:
        def __init__(self,**kwargs):captured['timeout']=kwargs['timeout']
        def connect(self,host,port):captured['target']=(host,port)
        def send_message(self,message):captured['message']=message;return {}
        def close(self):captured['closed']=True
    monkeypatch.setattr(delivery.smtplib,'SMTP',SMTP)
    settings=Settings(_env_file=None,app_env='development',invitation_delivery='mailpit',password_setup_frontend_url='http://localhost:3000')
    monkeypatch.setattr(delivery,'get_settings',lambda:settings)
    mailer=delivery.get_invitation_mailer();assert mailer.available and mailer.mode=='mailpit'
    token='x'*43;proof=mailer.send(recipient='synthetic@example.test',token=token,request_key=str(uuid4()))
    assert token not in proof and '/setup-password' not in proof
    assert captured['target']==('mailpit',1025) and captured['closed']
    message=captured['message']
    assert '[LOCAL TEST ONLY]' in message['Subject']
    assert 'http://localhost:3000/setup-password#token='+token in message.get_content()
    assert 'not delivered externally' in message.get_content()
    assert capsys.readouterr()==('','')
