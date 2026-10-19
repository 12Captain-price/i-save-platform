import json
from pathlib import Path

POLICY=json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))
CAPABILITIES={'registration-fees:record','registration-fees:verify','membership:approve','membership:activate','invitations:issue'}
