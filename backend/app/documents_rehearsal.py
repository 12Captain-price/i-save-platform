"""Create private manual-test credentials ONLY on the disposable document stack."""
import argparse
import os
import secrets
import sys
from sqlalchemy.orm import Session
from app.database import engine
from app.config import get_settings
from app.migrations import require_current_schema
from app.security.console import private_input
from app.security.hashing import hash_password
from app.security.auth import now
from app.models.user import User
from app.models.role import Role
from app.models.member import Member
from app.models.application import MembershipApplication
from app.models.membership import MembershipApproval
from app.models.audit_event import AuditEvent
from app.schemas.membership import PaymentRecord
from app.services import membership
from app.services.business_settings import active


def guard():
    if engine.url.database!='isave_test_browser' or get_settings().app_env!='test' or not get_settings().document_scan_test_only:
        raise RuntimeError('Disposable document rehearsal required')
    require_current_schema(engine)


def create(role):
    guard()
    if not sys.stdin.isatty():raise RuntimeError('Private interactive terminal required')
    email=private_input('New disposable email ending @example.test (hidden): ').strip().lower()
    if not email.endswith('@example.test') or email.count('@')!=1:raise RuntimeError('Synthetic address required')
    password=private_input('Unique disposable password (12–72 characters, hidden): ')
    if password!=private_input('Confirm disposable password (hidden): '):raise RuntimeError('Passwords differ')
    from app.schemas.user import UserCreate
    password=UserCreate(email=email,password=password).password
    with Session(engine) as db:
        if db.query(User).filter_by(email=email).first():raise RuntimeError('Account exists; no credential was changed')
        admin_role=db.query(Role).filter_by(name='administrator').one()
        if role=='admin':
            user=User(email=email,password_hash=hash_password(password),role_id=admin_role.id,is_active=True)
            db.add(user);db.flush()
        else:
            actor=db.query(User).filter_by(role_id=admin_role.id,is_active=True).first()
            if not actor:raise RuntimeError('An isolated Admin fixture is required')
            # Explicit synthetic fixture, not a public registration or a policy bypass for real applicants.
            app=MembershipApplication(application_number='MANUAL-ENROL-'+secrets.token_hex(8),first_name='Manual',last_name='Synthetic member',email=email,status='Pending')
            db.add(app);db.flush()
            _,terms=active(db)
            membership.record_payment(db,actor,app.id,PaymentRecord(amount=terms['registration_amount'],currency=terms['registration_currency'],payment_date=now().date(),reference='MANUAL-ENROL-'+secrets.token_hex(8)))
            db.flush();membership.verify_payment(db,actor,app.id);db.flush();membership.approve(db,actor,app.id);db.flush();membership.activate(db,actor,app.id);db.flush()
            user=db.get(User,db.get(MembershipApproval,app.id).user_id);user.password_hash=hash_password(password)
        db.add(AuditEvent(event_type='test_fixture',actor_user_id=user.id,actor_email=user.email,action='disposable_manual_account_created',target_table='users',target_id=str(user.id)))
        db.commit()
    print('PASS: disposable account created. Credentials were not printed. Use only http://127.0.0.1:13020/login. No normal database was accessed.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--role',choices=['admin','member'],required=True)
    args=parser.parse_args()
    try:create(args.role)
    except Exception:
        parser.exit(1,'Refused: check the isolated stack, synthetic address, password requirements or existing account. No credentials printed. No password reset performed.\n')
