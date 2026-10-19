"""Health endpoint."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import engine
from app.migrations import require_current_schema

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Process liveness; use /ready for database readiness."""
    settings = get_settings()
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


@router.get("/ready")
def ready():
    """Check connectivity, required tables and migration history without DDL."""
    try:
        require_current_schema(engine, verify_structure=False)
    except (SQLAlchemyError, RuntimeError):
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ok"}
