"""Public interest information only; this is not approved plan configuration."""
import json
from pathlib import Path

OPTIONS = json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))
CATEGORIES = {item['id']: item for item in OPTIONS['categories']}
