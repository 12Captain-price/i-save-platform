"""Public acknowledgement deliberately reveals no account or application state."""
import secrets
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.database import get_db
from app.models.application import MembershipApplication, RegistrationSubmission, ApplicationEvent, SavingsInterest, ApplicationSubmission
from app.registration_options import OPTIONS, CATEGORIES
from app.models.user import User
from app.schemas.application import PublicRegistration, AssistedRegistration
from app.security.auth import digest, require, now, current_session, validate_session, permissions, unauthenticated
from app.models.auth import AuthSession
from app.exceptions import APIError
from app.assisted_authorization import AUTHORIZATION
from app.services.auth import throttle

router = APIRouter(prefix="/api/v1/registration", tags=["registration"])
ACKNOWLEDGEMENT = {"message": "Your request has been received. Eligible new submissions are saved as pending applications for office review. This does not create a login, activate membership or confirm payment."}


@router.post("", status_code=202)
def register(body: PublicRegistration, request: Request, db: Session = Depends(get_db)):
    # Count duplicates too. Do not trust caller-supplied forwarded IP headers.
    throttle(db, digest("registration-ip:" + (request.client.host if request.client else "unknown")))
    return submit_pending(body, db)


@router.post('/assisted', status_code=202)
def assisted_register(body: AssistedRegistration, actor: User = Depends(require('applications:assist')), db: Session = Depends(get_db), session: AuthSession = Depends(current_session)):
    throttle(db, digest('assisted-registration-user:' + str(actor.id)))
    # Throttling commits independently. Revalidate and hold session/account locks
    # through the application transaction so revocation cannot slip between them.
    db.refresh(actor, with_for_update=True)
    db.refresh(session, with_for_update=True)
    validate_session(session)
    if not actor.is_active:
        raise unauthenticated()
    if 'applications:assist' not in permissions(db, actor):
        raise APIError(403, 'forbidden', 'Permission required')
    return submit_pending(body, db, actor)


def submit_pending(body: PublicRegistration, db: Session, actor=None):
    email = body.email.lower()
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    reserved = db.execute(insert(RegistrationSubmission).values(email_hash=digest(email))
        .on_conflict_do_nothing(index_elements=[RegistrationSubmission.email_hash])
        .returning(RegistrationSubmission.email_hash)).scalar_one_or_none()
    if reserved:
        account_exists = db.scalar(select(User.id).where(func.lower(User.email) == email).limit(1))
        application_exists = db.scalar(select(MembershipApplication.id).where(func.lower(MembershipApplication.email) == email).limit(1))
        if not account_exists and not application_exists:
            application = MembershipApplication(**{**body.model_dump(exclude={'preferred_category','interest_notice_version','applicant_authorized','authorization_version'}), "email":email},
                application_number="APP-" + secrets.token_hex(16), status="Pending")
            db.add(application)
            db.flush()
            db.get(RegistrationSubmission, digest(email)).application_id = application.id
            db.add(ApplicationSubmission(application_id=application.id, source='staff_assisted' if actor else 'public',
                actor_user_id=actor.id if actor else None, actor_email=actor.email if actor else None,
                applicant_authorized=bool(actor), authorization_version=AUTHORIZATION['version'] if actor else None,
                authorization_text=AUTHORIZATION['wording'] if actor else None, authorized_at=now() if actor else None))
            db.add(ApplicationEvent(application_id=application.id, status="Pending", actor_user_id=actor.id if actor else None,
                note=f"Staff-assisted application submitted; applicant authorisation acknowledged ({AUTHORIZATION['version']}); awaiting office review." if actor else "Public application submitted; awaiting office review."))
            if body.preferred_category:
                category = CATEGORIES[body.preferred_category]
                db.add(SavingsInterest(application_id=application.id, category=body.preferred_category,
                    category_label=category['label'], purpose=category['purpose'], notice_version=OPTIONS['version'],
                    notice_text=OPTIONS['notice'] + '\n' + OPTIONS['rules']))
    db.commit()
    return ACKNOWLEDGEMENT
