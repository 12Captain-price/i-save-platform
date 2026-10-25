"""Bounded ClamAV protocol; signature freshness is checked before every scan."""
import socket
import struct
import time
from datetime import datetime, timedelta, timezone
from app.config import get_settings
from app.exceptions import APIError
from app.security.auth import now


def reply(sock,deadline,limit=4096):
    data=b''
    while b'\0' not in data:
        sock.settimeout(max(0.001,deadline-time.monotonic()))
        part=sock.recv(min(1024,limit-len(data)))
        if not part or len(data)+len(part)>=limit or time.monotonic()>deadline:raise ValueError('Incomplete scanner reply')
        data+=part
    return data.rstrip(b'\0\n')


def version():
    s=get_settings();deadline=time.monotonic()+s.document_scan_timeout_seconds
    with socket.create_connection((s.document_scan_host,s.document_scan_port),timeout=s.document_scan_timeout_seconds) as sock:
        sock.sendall(b'zVERSION\0');v=reply(sock,deadline).decode('ascii')
    fields=v.split('/')
    if len(fields)!=3 or not fields[0].startswith('ClamAV ') or int(fields[1])<=0:raise ValueError('Scanner signatures unavailable')
    date=datetime.strptime(fields[2].strip(),'%a %b %d %H:%M:%S %Y').replace(tzinfo=timezone.utc)
    if not timedelta(0)<=now()-date<=timedelta(hours=s.document_scan_max_age_hours):raise ValueError('Scanner signatures unavailable or stale')
    return v


def status():
    from app.services.evidence import test_scanner_allowed
    if test_scanner_allowed():return {'available':True,'mode':'synthetic-test-only','message':'Isolated synthetic adapter; not malware validation.'}
    if not get_settings().document_scan_host:return {'available':False,'mode':'unavailable','message':'Scanning is not configured. Uploads are blocked.'}
    try:version();return {'available':True,'mode':'clamav','message':'Scanner reachable with current signatures. Each upload is scanned before storage.'}
    except Exception:return {'available':False,'mode':'unavailable','message':'Scanning or current signatures are unavailable. Uploads are blocked; retry later.'}


def scan(data):
    s=get_settings()
    try:
        v=version();deadline=time.monotonic()+s.document_scan_timeout_seconds
        with socket.create_connection((s.document_scan_host,s.document_scan_port),timeout=s.document_scan_timeout_seconds) as sock:
            sock.sendall(b'zINSTREAM\0')
            for i in range(0,len(data),65536):
                sock.settimeout(max(0.001,deadline-time.monotonic()));part=data[i:i+65536];sock.sendall(struct.pack('!I',len(part))+part)
            sock.sendall(struct.pack('!I',0));result=reply(sock,deadline)
        if result==b'stream: OK':return v[:100]
        if result.startswith(b'stream: ') and result.endswith(b' FOUND'):raise APIError(400,'unsafe_file','The file could not be accepted. Contact the office for help; do not email private documents.')
        raise ValueError('Scan failed')
    except APIError:raise
    except Exception:raise APIError(503,'scanner_unavailable','Scanning could not complete safely. No document was saved. Retry later or contact the office.') from None
