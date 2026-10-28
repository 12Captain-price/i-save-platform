"""Defence in depth for structured audit details, not a free-text DLP service.

Never pass request bodies, documents, passwords, headers or credential links to
audit writers. Arbitrary secrets in otherwise innocuous prose cannot be detected.
"""
import json
import re
from sqlalchemy import event
from app.models.audit_event import AuditEvent

PRIVATE_KEYS = re.compile(r'password|secret|token|authorization|cookie|credential|private_url|invitation_url|recovery_url',re.I)
URL = re.compile(r'https?://[^\s<>"\']+',re.I)


def safe_details(value):
    def clean(item):
        if isinstance(item,dict):
            return {str(k): '[REDACTED]' if PRIVATE_KEYS.search(str(k)) else clean(v) for k,v in item.items()}
        if isinstance(item,list): return [clean(v) for v in item]
        if isinstance(item,str):
            item=URL.sub('[URL REDACTED]',item)
            return re.sub(r'(?i)\b(?:bearer\s+\S+|(?:password|token|secret|cookie)\s*[=:]\s*\S+)', '[REDACTED]',item)
        return item
    if value is None: return None
    try: return json.dumps(clean(json.loads(value)),sort_keys=True)
    except (ValueError,TypeError): return clean(str(value))


@event.listens_for(AuditEvent,'before_insert')
def protect_details(mapper, connection, target):
    target.details=safe_details(target.details)
