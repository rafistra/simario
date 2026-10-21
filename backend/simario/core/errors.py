"""Error envelope for every /api/ response: {"code", "message", "details"} with Indonesian copy
ready to show (docs/03_api_contract.md §2.1)."""

from typing import Any

from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response

STATUS_BY_CODE: dict[str, int] = {
    "unauthenticated": 401,
    "forbidden": 403,
    "not_found": 404,
    "validation": 422,
    "empty": 422,
    "bands_invalid": 422,
    "options_invalid": 422,
    "errors": 422,
    "old_password": 422,
    "too_short": 422,
    "same": 422,
    "not_local": 422,
    "archived": 409,
    "locked": 409,
    "final": 409,
    "sent": 409,
    "excluded": 409,
    "not_started": 409,
    "occupied": 409,
    "type_in_use": 409,
    "nothing": 409,
    "server": 500,
}

MESSAGES = {
    "unauthenticated": "Sesi Anda berakhir. Silakan masuk kembali.",
    "forbidden": "Anda tidak memiliki akses untuk tindakan ini.",
    "not_found": "Data tidak ditemukan.",
    "validation": "Isian belum valid.",
    "server": "Terjadi kesalahan pada server. Silakan coba lagi.",
}


class ApiError(exceptions.APIException):
    """Raised by services with a contract code and the message the user sees."""

    def __init__(
        self, code: str, message: str, details: Any = None, status: int | None = None
    ) -> None:
        super().__init__(detail=message, code=code)
        self.error_code = code
        self.message = message
        self.details = details
        self.status_code = status or STATUS_BY_CODE.get(code, 400)


def envelope(code: str, message: str | None = None, details: Any = None) -> dict[str, Any]:
    return {"code": code, "message": message or MESSAGES[code], "details": details}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF exception handler. Returns None for non-API errors so ApiErrorMiddleware answers 500."""
    if isinstance(exc, ApiError):
        return Response(envelope(exc.error_code, exc.message, exc.details), exc.status_code)
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        return Response(envelope("unauthenticated"), 401)
    if isinstance(exc, exceptions.PermissionDenied):
        return Response(envelope("forbidden"), 403)
    if isinstance(exc, Http404 | exceptions.NotFound):
        return Response(envelope("not_found"), 404)
    if isinstance(exc, exceptions.ValidationError):
        return Response(envelope("validation", details=exc.detail), 422)
    if isinstance(exc, exceptions.APIException):
        return Response(envelope(exc.default_code, str(exc.detail)), exc.status_code)
    return None
