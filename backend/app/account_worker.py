"""Repeatable private account-email worker. Never logs recipients, links or tokens."""
import argparse,time
from sqlalchemy.orm import Session
from app.database import engine
from app.migrations import require_current_schema
from app.services.account_workflows import process_recovery
from app.services.campaigns import process_one


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    require_current_schema(engine)
    from app.deployment import validate_deployment_data
    validate_deployment_data(engine)
    while True:
        try:
            with Session(engine) as db:
                for _ in range(100):
                    if not process_recovery(db):break
                for _ in range(10):
                    if not process_one(db):break
        except Exception:
            # No raw SMTP/SQL exception text. Claimed jobs require replacement.
            print('Account-email batch stopped safely; inspect protected delivery status.')
            if args.once:raise SystemExit(1)
        if args.once:return
        time.sleep(5)


if __name__=='__main__':main()
