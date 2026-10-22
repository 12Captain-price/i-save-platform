"""Private image evidence, fail-closed scanning and append-only reviews.

Original bytes stay in PostgreSQL, never public storage. Client names are discarded.
"""
import base64
import hashlib
import io
import json
import socket
import struct
import warnings
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from PIL import Image
from sqlalchemy import select
from app.config import get_settings
from app.exceptions import APIError
from app.models.evidence_enrolment import RegistrationEvidenceProfile as Profile, ApplicationEvidence as Evidence, EvidenceReview as Review
from app.schemas.evidence import CONSENT_TEXT, CONSENT_VERSION
from app.security.auth import now
from app.services.business_settings import active
from app.services.membership import lock_application, event, advisory, check_pending

MAX_FILE = 2 * 1024 * 1024
REQUIREMENTS = ('require_national_id', 'require_residence_evidence', 'require_income_evidence', 'require_evidence_acceptance', 'document_retention_days')


def test_scanner_allowed():
    s = get_settings()
    from sqlalchemy.engine import make_url
    return s.document_scan_test_only and s.app_env == 'test' and (make_url(s.database_url).database or '').startswith('isave_test_')


def scan_available():
    return bool(get_settings().document_scan_host or test_scanner_allowed())


def scan(data):
    s = get_settings()
    if test_scanner_allowed():
        if b'EICAR' in data:
            raise APIError(400, 'unsafe_file', 'The file could not be accepted')
        return 'Synthetic isolated test scanner — not production malware validation'
    if not s.document_scan_host:
        raise APIError(503, 'scanner_unavailable', 'Private upload scanning is unavailable. Contact the office; do not email documents.')
    try:
        with socket.create_connection((s.document_scan_host, s.document_scan_port), timeout=5) as sock:
            sock.sendall(b'zVERSION\0')
            version = sock.recv(1024).decode('ascii', errors='strict').strip('\0\n')
        # Refuse an uninitialised/stale signature database; no silent scan bypass.
        signature_date = datetime.strptime(version.rsplit('/', 1)[-1].strip(), '%a %b %d %H:%M:%S %Y').replace(tzinfo=timezone.utc)
        if not timedelta(0) <= now() - signature_date <= timedelta(days=7):
            raise ValueError('Scanner signatures not current')
        with socket.create_connection((s.document_scan_host, s.document_scan_port), timeout=10) as sock:
            sock.sendall(b'zINSTREAM\0')
            for offset in range(0, len(data), 65536):
                chunk = data[offset:offset+65536]
                sock.sendall(struct.pack('!I', len(chunk)) + chunk)
            sock.sendall(struct.pack('!I', 0))
            response = sock.recv(4096)
        if response.strip(b'\0\n') != b'stream: OK':
            raise APIError(400, 'unsafe_file', 'The file could not be accepted')
        return version[:100]
    except APIError:
        raise
    except Exception:
        raise APIError(503, 'scanner_unavailable', 'Private upload scanning is unavailable. Retry later or contact the office.') from None


def validate_upload(upload):
    # Filenames never become paths, headers or log data. Reject path/control tricks too.
    if any(ch in upload.filename for ch in '/\\') or any(ord(ch)<32 for ch in upload.filename) or upload.filename.startswith('.'):
        raise APIError(400, 'unsafe_filename', 'Use a simple PNG or JPEG filename')
    extension = upload.filename.rsplit('.', 1)[-1].lower()
    expected = 'PNG' if upload.content_type == 'image/png' else 'JPEG'
    if extension not in ({'png'} if expected == 'PNG' else {'jpg', 'jpeg'}):
        raise APIError(400, 'unsafe_file', 'Filename and file type must match')
    try:
        data = base64.b64decode(upload.data, validate=True)
    except Exception:
        raise APIError(400, 'unsafe_file', 'Invalid file encoding') from None
    if not 1 <= len(data) <= MAX_FILE:
        raise APIError(400, 'file_size', 'Each image must be no larger than 2 MiB')
    # Scan the original bytes before parsing. Parser warnings/errors disclose no contents.
    engine = scan(data)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error')
            with Image.open(io.BytesIO(data), formats=['PNG', 'JPEG']) as image:
                if image.format != expected or image.width * image.height > 16_000_000 or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('Unsupported image')
                image.verify()
            with Image.open(io.BytesIO(data), formats=['PNG', 'JPEG']) as image:
                image.load()
    except Exception:
        raise APIError(400, 'unsafe_file', 'Use a valid single-page PNG or JPEG image, at most 16 megapixels') from None
    return {'kind': upload.kind, 'content': data, 'content_type': upload.content_type,
            'sha256': hashlib.sha256(data).hexdigest(), 'scan_engine': engine}


def prepare(db, body):
    version, settings = active(db)
    policy = {k: settings.get(k, False if k.startswith('require_') else None) for k in REQUIREMENTS}
    policy['settings_version'] = version
    if get_settings().app_env == 'production' and (body.national_id or body.income_source or body.evidence) and not policy['document_retention_days']:
        raise APIError(503,'retention_unconfigured','Production document collection requires approved retention and privacy operations')
    kinds = {u.kind for u in body.evidence}
    if policy['require_national_id'] and not body.national_id:
        raise APIError(400, 'missing_evidence', 'National ID number is required by the current application requirements')
    if policy['require_residence_evidence'] and 'residence' not in kinds:
        raise APIError(400, 'missing_evidence', 'Proof of residence is required')
    income_kind = 'self_employed' if body.income_source == 'self_employed' else 'income'
    if policy['require_income_evidence'] and (not body.income_source or income_kind not in kinds):
        raise APIError(400, 'missing_evidence', 'Select your source of income and include the appropriate supporting evidence')
    return policy, [validate_upload(u) for u in body.evidence]


def persist(db, application, body, prepared, actor=None):
    policy, uploads = prepared
    db.add(Profile(application_id=application.id, national_id=body.national_id, income_source=body.income_source,
        requirements_snapshot=json.dumps(policy), consent_text=CONSENT_TEXT if body.evidence_consent else None,
        consent_version=CONSENT_VERSION if body.evidence_consent else None, consent_at=now() if body.evidence_consent else None))
    for upload in uploads:
        db.add(Evidence(application_id=application.id, **upload, actor_id=actor.id if actor else None, actor_email=actor.email if actor else None))


def current_evidence(db, application_id):
    rows = db.query(Evidence).filter_by(application_id=application_id).order_by(Evidence.id).all()
    replaced = {r.replaces_id for r in rows if r.replaces_id}
    return [r for r in rows if r.id not in replaced]


def approval_blockers(db, application_id):
    profile = db.get(Profile, application_id)
    if not profile:
        return []  # Never invent verification or retrospectively apply new settings.
    policy = json.loads(profile.requirements_snapshot)
    rows = current_evidence(db, application_id)
    by_kind = {r.kind: r for r in rows}
    needed = []
    if policy.get('require_national_id') and not profile.national_id:
        needed.append('National ID number is missing.')
    required = []
    if policy.get('require_residence_evidence'): required.append('residence')
    if policy.get('require_income_evidence'):
        required.append('self_employed' if profile.income_source == 'self_employed' else 'income')
    for kind in required:
        if kind not in by_kind: needed.append(kind.replace('_', ' ') + ' evidence is missing.')
    if policy.get('require_evidence_acceptance'):
        for row in rows:
            review = db.query(Review).filter_by(evidence_id=row.id).order_by(Review.id.desc()).first()
            if not review or review.outcome != 'Accepted':
                needed.append(row.kind.replace('_', ' ') + ' evidence must be accepted.')
    return needed


def detail(db, application_id):
    lock_application(db, application_id)
    profile = db.get(Profile, application_id)
    rows = db.query(Evidence).filter_by(application_id=application_id).order_by(Evidence.id).all()
    replaced = {r.replaces_id for r in rows if r.replaces_id}
    items = []
    for row in rows:
        history = db.query(Review).filter_by(evidence_id=row.id).order_by(Review.id).all()
        items.append({'id':row.id, 'kind':row.kind, 'content_type':row.content_type, 'size':len(row.content),
            'recorded_at':row.recorded_at, 'submitted_by':row.actor_email, 'replaces_id':row.replaces_id,
            'superseded':row.id in replaced, 'status':history[-1].outcome if history else 'Awaiting review',
            'history':[{'id':r.id,'outcome':r.outcome,'reason':r.reason,'reviewer':r.actor_email,'recorded_at':r.recorded_at} for r in history]})
    return {'national_id':profile.national_id if profile else None, 'income_source':profile.income_source if profile else None,
        'requirements':json.loads(profile.requirements_snapshot) if profile else None,
        'consent':None if not profile else {'text':profile.consent_text,'version':profile.consent_version,'at':profile.consent_at},
        'items':items,'missing':[kind for kind in ('residence','self_employed' if profile and profile.income_source=='self_employed' else 'income') if not any(r['kind']==kind and not r['superseded'] for r in items)],
        'approval_blockers':approval_blockers(db,application_id),
        'retention_notice':'Retention period is not configured. Production privacy, encrypted backup and retention operations require approval.' if not profile or not json.loads(profile.requirements_snapshot).get('document_retention_days') else 'Recorded retention policy only; automatic deletion is not implemented.'}


def review(db, actor, application_id, evidence_id, body):
    app = lock_application(db, application_id); check_pending(app)
    row = db.get(Evidence, evidence_id)
    if not row or row.application_id != application_id: raise APIError(404,'not_found','Evidence not found')
    advisory(db, 'evidence-review-key:'+str(body.request_key))
    old = db.query(Review).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if (old.evidence_id,old.outcome,old.reason)!=(evidence_id,body.outcome,body.reason):raise APIError(409,'conflict','Request key reused')
        return
    if db.query(Evidence).filter_by(replaces_id=evidence_id).first():raise APIError(409,'conflict','Review the replacement evidence')
    latest = db.query(Review).filter_by(evidence_id=evidence_id).order_by(Review.id.desc()).first()
    if (latest.id if latest else 0) != body.base_review_id:raise APIError(409,'conflict','Evidence review changed; reload')
    db.add(Review(evidence_id=evidence_id,outcome=body.outcome,reason=body.reason,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key)))
    # Do not include sensitive identifiers, file bytes or reviewer free text in application logs.
    event(db,actor,'registration_evidence_reviewed',app,'Document review recorded: '+body.outcome+'. See protected Documents history.',{'evidence_id':evidence_id,'outcome':body.outcome})


def replace(db, actor, application_id, body):
    if not body.applicant_authorized or body.consent_version != CONSENT_VERSION:
        raise APIError(400,'consent_required','Confirm applicant authorisation and current evidence consent')
    app = lock_application(db,application_id); check_pending(app)
    validated = validate_upload(body.evidence)
    advisory(db,'evidence-replacement-key:'+str(body.request_key))
    old = db.query(Evidence).filter_by(request_key=str(body.request_key)).one_or_none()
    if old:
        if (old.application_id,old.kind,old.sha256,old.replaces_id)!=(application_id,body.evidence.kind,validated['sha256'],body.replaces_id):raise APIError(409,'conflict','Request key reused')
        return
    current = next((r for r in current_evidence(db,application_id) if r.kind==body.evidence.kind),None)
    if (current.id if current else None) != body.replaces_id:raise APIError(409,'conflict','Reload the current evidence before replacing')
    db.add(Evidence(application_id=application_id,**validated,replaces_id=body.replaces_id,actor_id=actor.id,actor_email=actor.email,request_key=str(body.request_key)))
    event(db,actor,'registration_evidence_replaced',app,'Staff submitted authorised evidence; previous evidence and reviews retained; new evidence awaits review.',{
        'kind':body.evidence.kind,'consent_version':CONSENT_VERSION,'consent_text':CONSENT_TEXT,
        'staff_authorization_text':'The applicant authorises me to submit this evidence for private membership review. I have explained the evidence consent and confirmed the details with them.',
        'authorized_at':now().isoformat(),'actor_id':actor.id})
