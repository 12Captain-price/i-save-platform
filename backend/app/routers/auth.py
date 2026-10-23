"""Bearer-only authentication; no cookies, query tokens or public admin signup."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import AuthSession
from app.models.user import User
from app.schemas.common import Email
from app.schemas.user import UserOut
from app.security.auth import current_session, current_user, now, permissions, digest, validate_session
from app.services.auth import audit, login
from app.services.auth import revoke_all, throttle, revoke_setup_links
from app.security.hashing import hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


from app.schemas.membership import PasswordSetup


@router.post('/setup-password',status_code=204)
def setup_password(body:PasswordSetup,request:Request,db:Session=Depends(get_db)):
    from app.config import get_settings
    from app.exceptions import APIError
    from app.services.membership import consume_invitation
    if get_settings().app_env.lower()=='production' and request.url.scheme!='https':raise APIError(400,'https_required','HTTPS is required')
    throttle(db,digest('password-setup-ip:'+(request.client.host if request.client else 'unknown')))
    throttle(db,digest('password-setup-token:'+body.token))
    from app.models.account_workflows import AccountLink
    from app.services.account_workflows import consume
    if db.get(AccountLink,digest(body.token)):
        consume(db,body.token,body.password,'staff')
    else:
        consume_invitation(db,body.token,body.password);db.commit()
    return Response(status_code=204,headers={'Cache-Control':'no-store'})


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Email
    password: str = Field(min_length=1, max_length=128, repr=False)


@router.post("/login")
def sign_in(body: Login, request: Request, response: Response, db: Session = Depends(get_db)):
    from app.config import get_settings
    from app.exceptions import APIError
    if get_settings().app_env.lower() == "production" and request.url.scheme != "https":
        raise APIError(400, "https_required", "HTTPS is required")
    token, expires = login(db, body.email, body.password, request.client.host if request.client else "unknown")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return {"access_token": token, "token_type": "bearer", "expires_at": expires}


@router.get("/me")
def me(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    workspace = {"member":"member", "staff":"staff", "finance":"finance", "administrator":"admin"}.get(user.role.name if user.role else "")
    return {"user": UserOut.model_validate(user), "workspace": workspace, "permissions": sorted(permissions(db, user))}


@router.post("/logout", status_code=204)
def logout(session: AuthSession = Depends(current_session), user: User = Depends(current_user), db: Session = Depends(get_db)):
    session.revoked_at = now()
    audit(db, user, "logout")
    db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128, repr=False)
    new_password: str = Field(min_length=12, max_length=72, repr=False)


@router.post("/password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user),
                    session: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    from sqlalchemy import select, update
    from app.exceptions import APIError
    session_key = session.token_hash
    throttle(db, digest("password-change:" + str(user.id)))
    if db.bind.dialect.name == "sqlite":
        db.execute(update(User).where(User.id == user.id).values(id=User.id, updated_at=User.updated_at))
    user = db.execute(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    # Administrative/password revocation may have completed while this request
    # waited for the account lock. Check the current row rather than cached auth.
    db.expire(session)
    validate_session(db.get(AuthSession, session_key))
    if not user.is_active or not user.password_hash or not verify_password(body.current_password, user.password_hash):
        raise APIError(401, "invalid_credentials", "Invalid credentials")
    if len(body.new_password.encode("utf-8")) > 72:
        raise APIError(400, "bad_request", "Password must be at most 72 UTF-8 bytes")
    user.password_hash = hash_password(body.new_password)
    revoke_all(db, user.id)
    revoke_setup_links(db,user.id)
    audit(db, user, "password_changed_sessions_revoked")
    db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
