"""Repeatable CLI: --once for a scheduler, or a private worker service."""
import sys
import time
from app.services.backups import process_one

def main():
    from app.database import engine
    from app.deployment import validate_deployment_data
    validate_deployment_data(engine)
    while True:
        try:processed=process_one()
        except Exception:
            print('Operations worker unavailable; check protected operational status.',flush=True)
            if '--once' in sys.argv:return 1
            time.sleep(15);continue
        if '--once' in sys.argv:return 1 if processed=='Failed' else 0
        time.sleep(1 if processed else 15)

if __name__=='__main__':raise SystemExit(main())
