"""Run `python -m app.bootstrap --email address` in a trusted terminal."""
import argparse
import sys
from app.security.console import private_input

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import engine
from app.exceptions import conflict
from app.migrations import require_current_schema
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.schemas.user import UserCreate
from app.security.auth import PERMISSIONS, TEMPLATES
from app.security.hashing import hash_password
from app.services.auth import audit


def bootstrap(db, email, password):
    # Dedicated CLI transaction; serialize competing bootstrap processes.
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(7341592602)"))
    else:
        db.execute(text("BEGIN IMMEDIATE"))
    email = email.strip().lower()
    validated = UserCreate(email=email, password=password)
    if db.query(User).join(Role).filter(func.lower(Role.name).in_(["admin", "administrator"])).first():
        raise conflict("An administrator already exists; bootstrap refused")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise conflict("Account exists; bootstrap never promotes or overwrites an existing account")
    # Refuse ambiguous legacy role names rather than silently changing meaning.
    for role in db.query(Role).all():
        if role.name.lower() in TEMPLATES and role.name != role.name.lower():
            raise conflict("Legacy role names need explicit review")
    perms = {}
    for code in sorted(PERMISSIONS):
        permission = db.query(Permission).filter_by(code=code).first()
        if not permission:
            permission = Permission(code=code)
            db.add(permission)
            db.flush()
        perms[code] = permission
    roles = {}
    for name, codes in TEMPLATES.items():
        role = db.query(Role).filter_by(name=name).first()
        if role:
            # Do not change existing role assignments as a bootstrap side effect.
            if role.permissions or role.users:
                raise conflict("Existing role permissions need explicit review before bootstrap")
        else:
            role = Role(name=name)
            db.add(role)
            db.flush()
        roles[name] = role
        for code in sorted(codes):
            db.add(RolePermission(role_id=role.id, permission_id=perms[code].id))
    user = User(email=email, password_hash=hash_password(validated.password), role_id=roles["administrator"].id, is_active=True)
    db.add(user)
    db.flush()
    audit(db, user, "initial_admin_created")
    db.commit()
    return user


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Omit to enter the account address privately")
    args = parser.parse_args()
    if not sys.stdin.isatty():
        parser.exit(1, "Use an interactive terminal; refusing password input without a TTY.\n")
    try:
        require_current_schema(engine)
        email = args.email or private_input("Initial administrator email (hidden): ")
        password = private_input("Initial administrator password (12+ characters): ")
        if password != private_input("Confirm password: "):
            parser.exit(1, "Passwords differ; nothing changed.\n")
        with Session(engine) as db:
            bootstrap(db, email, password)
    except Exception:
        # Never include password, database URL or validation input in CLI output.
        parser.exit(1, "Bootstrap refused. Check schema, existing administrators/roles, email and password requirements. Nothing committed.\n")
    print("Initial administrator created. No credentials printed.")


if __name__ == "__main__":
    main()
