"""FastAPI application entry point.

Creates the application, registers middleware, exception handlers and routers,
and checks that database migrations have been applied before serving requests.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import engine
from app.migrations import require_current_schema
from app.exceptions import APIError, api_error_handler

# Register models for ORM relationships; schema changes belong to Alembic.
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
from app.routers.auth import router as auth_router
from app.routers.admin import router as admin_router
from app.routers.registration import router as registration_router
from app.routers.membership import router as membership_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    require_current_schema(engine)
    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    debug=settings.app_debug,
    docs_url="/docs" if settings.app_debug else None,
    redoc_url="/docs" if settings.app_debug else None,
    openapi_url="/openapi.json" if settings.app_debug else None,
)


@app.middleware("http")
async def private_no_store(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/"):
        response.headers["Cache-Control"] = "no-store"
    return response

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
                "details": {"errors": [{"loc": e["loc"], "type": e["type"], "msg": e["msg"]} for e in exc.errors()]},
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


# API routers. Each router carries its own path prefix; health is at /health,
# entity routers are mounted under /api/v1 via their router prefixes.
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(registration_router)
app.include_router(membership_router)
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

from app.routers.plan_drafts import router as plan_drafts_router
app.include_router(plan_drafts_router)

from app.routers.business_settings import router as business_settings_router
app.include_router(business_settings_router)

from app.routers.fee_rates import router as fee_rates_router
from app.routers.subscription_payments import router as subscription_payments_router
app.include_router(fee_rates_router)
app.include_router(subscription_payments_router)
from app.routers.evidence import router as evidence_router
from app.routers.enrolment import router as enrolment_router
from app.security.body_limit import EvidenceBodyLimit
app.include_router(evidence_router)
app.include_router(enrolment_router)
app.add_middleware(EvidenceBodyLimit)

from app.routers.savings import router as savings_router
app.include_router(savings_router)
from app.routers.financial_operations import router as financial_operations_router
app.include_router(financial_operations_router)
from app.routers.withdrawals import router as withdrawals_router
app.include_router(withdrawals_router)
from app.routers.account_workflows import router as account_workflows_router
app.include_router(account_workflows_router)
from app.routers.content_support import router as content_support_router
app.include_router(content_support_router)
from app.routers.campaigns import router as campaigns_router
app.include_router(campaigns_router)
