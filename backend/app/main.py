"""FastAPI application entry point.

Creates the application, registers middleware, exception handlers and routers,
and prepares the database schema on startup.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import Base, engine
from app.exceptions import APIError, api_error_handler

# Import every model so Base.metadata is fully populated before create_all.
import app.models  # noqa: F401
from app.routers.applications import router as applications_router
from app.routers.audit import router as audit_router
from app.routers.contributions import router as contributions_router
from app.routers.fees import router as fees_router
from app.routers.health import router as health_router
from app.routers.members import router as members_router
from app.routers.plans import router as plans_router
from app.routers.roles import router as roles_router
from app.routers.subscriptions import router as subscriptions_router
from app.routers.users import router as users_router
from app.routers.verifications import router as verifications_router

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    docs_url="/docs" if settings.app_debug else None,
    redoc_url="/docs" if settings.app_debug else None,
    openapi_url="/openapi.json" if settings.app_debug else None,
)

# Cross-origin requests from the local frontend dev server.
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Consistent error shapes.
app.add_exception_handler(APIError, api_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "database_error",
                "message": "A database error occurred",
                "details": {},
            }
        },
    )


@app.on_event("startup")
def on_startup() -> None:
    """Create all tables defined by the SQLAlchemy models.

    In production/staging this is managed by Alembic migrations; this call is
    a convenience for local development so the schema exists without running
    ``alembic upgrade head`` manually.
    """
    Base.metadata.create_all(bind=engine)


# API routers. Each router carries its own path prefix; health is at /health,
# entity routers are mounted under /api/v1 via their router prefixes.
app.include_router(health_router)
app.include_router(members_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(plans_router)
app.include_router(applications_router)
app.include_router(fees_router)
app.include_router(subscriptions_router)
app.include_router(contributions_router)
app.include_router(verifications_router)
app.include_router(audit_router)
