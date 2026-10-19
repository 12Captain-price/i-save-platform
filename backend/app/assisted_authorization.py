import json
from pathlib import Path

AUTHORIZATION = json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))
