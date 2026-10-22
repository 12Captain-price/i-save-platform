"""Private terminal recovery for one existing disposable rehearsal member only."""
import hashlib
import sys
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session
from app.documents_rehearsal import guard
from app.database import engine
from app.security.console import private_input
from app.security.hashing import hash_password
from app.security.auth import now
from app.models.user import User
from app.models.member import Member
from app.models.auth import AuthSession
from app.models.membership import PasswordSetupInvitation
from app.models.evidence_enrolment import PlanApplication, PlanEnrolment
from app.models.audit_event import AuditEvent


def business_fingerprint(db):
    # All retained business tables, including document bytes and accepted terms.
    # Only digests are held in memory; row contents are never printed or logged.
    names = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).scalars()
    result = {}
    for name in names:
        if name in {'users', 'auth_sessions', 'password_setup_invitations', 'audit_events'}:
            continue
        quoted = db.bind.dialect.identifier_preparer.quote(name)
        values = db.execute(text(f'SELECT row_to_json(t)::text FROM {quoted} t')).scalars()
        result[name] = sorted(hashlib.sha256(v.encode()).hexdigest() for v in values)
    return result


def recover():
    guard()  # Refuses normal DB before any connection, including schema checks.
    if not sys.stdin.isatty():
        raise RuntimeError('Private interactive terminal required')
    with Session(engine) as db:
        user = db.execute(select(User).where(User.email == 'member@example.test').with_for_update()).scalar_one()
        member = db.query(Member).filter_by(user_id=user.id).one()
        application = db.get(PlanApplication, 2)
        if (not user.is_active or user.role.name != 'member' or not application
                or application.member_id != member.id or application.version_id != 5
                or application.status != 'Active' or not db.get(PlanEnrolment, 2)):
            raise RuntimeError('Expected existing member/enrolment required')
        password = private_input('New unique disposable member password (hidden): ')
        if password != private_input('Confirm new password (hidden): '):
            raise RuntimeError('Passwords differ')
        from app.schemas.user import UserCreate
        password = UserCreate(email=user.email, password=password).password
        before = business_fingerprint(db)
        other_users = [(u.id, u.password_hash) for u in db.query(User).filter(User.id != user.id)]
        user.password_hash = hash_password(password)
        timestamp = now()
        db.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).values(revoked_at=timestamp))
        db.execute(update(PasswordSetupInvitation).where(PasswordSetupInvitation.user_id == user.id,
            PasswordSetupInvitation.consumed_at.is_(None), PasswordSetupInvitation.revoked_at.is_(None)).values(revoked_at=timestamp))
        db.add(AuditEvent(event_type='test_fixture', actor_user_id=user.id, actor_email=user.email,
            action='disposable_member_password_recovered', target_table='users', target_id=str(user.id),
            details='Private local terminal recovery; member sessions and outstanding setup invitations revoked.'))
        db.flush()
        if before != business_fingerprint(db) or other_users != [(u.id, u.password_hash) for u in db.query(User).filter(User.id != user.id)]:
            raise RuntimeError('Preservation check failed; rollback required')
        db.commit()
    print('PASS: existing disposable member password updated; sessions and unused setup links revoked. Business records and other accounts preserved. Use only port 13020.')


if __name__ == '__main__':
    try:
        recover()
    except Exception:
        sys.exit('Refused: isolated environment, existing member/enrolment, private terminal or password validation failed. No credentials printed; uncommitted changes rolled back.')
