"""Consistent, domain-oriented error handling for the API.

All API errors use a single response shape::

    { "error": { "code": "...", "message": "...", "details": {} } }
"""
from typing import Any, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class APIError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details or {}},
            headers=headers,
        )
        self.code = code
        self.details = details or {}


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail}, headers=exc.headers)


def bad_request(message: str = "Invalid request", details: Optional[dict[str, Any]] = None) -> APIError:
    return APIError(status_code=400, code="bad_request", message=message, details=details)


def not_found(message: str = "Resource not found", details: Optional[dict[str, Any]] = None) -> APIError:
    return APIError(status_code=404, code="not_found", message=message, details=details)


def conflict(message: str = "Resource already exists", details: Optional[dict[str, Any]] = None) -> APIError:
    return APIError(status_code=409, code="conflict", message=message, details=details)
