"""Repeatable scheduler: python -m app.subscription_schedule [--through YYYY-MM] [--preview]."""
import argparse
from sqlalchemy.orm import Session
from app.database import engine
from app.migrations import require_current_schema
from app.services.recurring_subscriptions import plan, generate


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--through')
    parser.add_argument('--preview',action='store_true')
    args=parser.parse_args()
    from app.config import get_settings
    if not args.preview and get_settings().effective_launch_mode != 'full':
        raise SystemExit('Subscription generation is unavailable in the current launch mode')
    require_current_schema(engine)
    from app.deployment import validate_deployment_data
    validate_deployment_data(engine)
    with Session(engine) as db:
        result=plan(db,args.through) if args.preview else generate(db,through=args.through)
        if not args.preview:db.commit()
        print(('Preview missing' if args.preview else 'Created')+': '+str(result['count']))
        print('Memberships requiring explicit review: '+str(len(result['requires_review_member_ids'])))


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Subscription schedule failed; transaction rolled back. Check schema, settings and through-month. No private records printed.')
