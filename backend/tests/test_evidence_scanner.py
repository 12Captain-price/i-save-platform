from datetime import timedelta
import pytest
from app.services import evidence
from app.config import get_settings
from app.exceptions import APIError


@pytest.mark.parametrize('result,age,accepted',[(b'stream: OK\0',1,True),(b'stream: Eicar-Test-Signature FOUND\0',1,False),(b'stream: ERROR\0',1,False),(b'stream: OK\0',9,False)])
def test_clamd_protocol_requires_fresh_signatures_and_clean_result(monkeypatch,result,age,accepted):
    settings=get_settings();monkeypatch.setattr(settings,'document_scan_host','synthetic-scanner');monkeypatch.setattr(settings,'document_scan_test_only',False)
    sent=[];connections=[]
    version=('ClamAV test/123/'+(evidence.now()-timedelta(days=age)).strftime('%a %b %d %H:%M:%S %Y')).encode()+b'\0'
    class Socket:
        def __init__(self,response):self.response=response
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def sendall(self,data):sent.append(data)
        def recv(self,size):return self.response
    def connect(*args,**kw):
        connections.append(1);return Socket(version if len(connections)==1 else result)
    monkeypatch.setattr(evidence.socket,'create_connection',connect)
    if accepted:
        assert evidence.scan(b'synthetic bytes').startswith('ClamAV')
        assert b'zVERSION\0' in sent and b'zINSTREAM\0' in sent and b'\x00\x00\x00\x00' in sent
    else:
        with pytest.raises(APIError):evidence.scan(b'synthetic bytes')


def test_scanner_timeout_never_accepts(monkeypatch):
    settings=get_settings();monkeypatch.setattr(settings,'document_scan_host','synthetic-scanner');monkeypatch.setattr(settings,'document_scan_test_only',False)
    def timeout(*args,**kw):raise TimeoutError('Synthetic')
    monkeypatch.setattr(evidence.socket,'create_connection',timeout)
    with pytest.raises(APIError) as caught:evidence.scan(b'synthetic bytes')
    assert caught.value.status_code==503
