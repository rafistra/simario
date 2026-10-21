"""Error envelope for every /api/ response: {"code", "message", "details"} with Indonesian copy
ready to show (docs/03_api_contract.md §2.1)."""

from typing import Any

from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import set_rollback

STATUS_BY_CODE: dict[str, int] = {
    "unauthenticated": 401,
    "login_failed": 401,
    "forbidden": 403,
    "not_found": 404,
    "method_not_allowed": 405,
    "locked_out": 423,
    "throttled": 429,
    "bad_request": 400,
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
    "method_not_allowed": "Metode tidak didukung.",
    "throttled": "Terlalu banyak permintaan. Coba lagi nanti.",
    "bad_request": "Permintaan tidak dapat diproses.",
    "server": "Terjadi kesalahan pada server. Silakan coba lagi.",
}


class ApiError(exceptions.APIException):
    """Raised by services with a contract code and the message the user sees."""

    def __init__(
        self, code: str, message: str, details: Any = None, status: int | None = None
    ) -> None:
        if status is None and code not in STATUS_BY_CODE:
            raise ValueError(f"Unknown ApiError code {code!r}; add it to STATUS_BY_CODE")
        super().__init__(detail=message, code=code)
        self.error_code = code
        self.message = message
        self.details = details
        self.status_code = status or STATUS_BY_CODE[code]


def envelope(code: str, message: str | None = None, details: Any = None) -> dict[str, Any]:
    return {"code": code, "message": message or MESSAGES[code], "details": details}


def _respond(body: dict[str, Any], status: int) -> Response:
    set_rollback()
    return Response(body, status)


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF exception handler. Returns None for non-API errors so ApiErrorMiddleware answers 500."""
    if isinstance(exc, ApiError):
        return _respond(envelope(exc.error_code, exc.message, exc.details), exc.status_code)
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        return _respond(envelope("unauthenticated"), 401)
    if isinstance(exc, exceptions.PermissionDenied):
        return _respond(envelope("forbidden"), 403)
    if isinstance(exc, Http404 | exceptions.NotFound):
        return _respond(envelope("not_found"), 404)
    if isinstance(exc, exceptions.ValidationError):
        return _respond(envelope("validation", details=exc.detail), 422)
    if isinstance(exc, exceptions.ParseError | exceptions.UnsupportedMediaType):
        return _respond(envelope("validation"), 422)
    if isinstance(exc, exceptions.MethodNotAllowed):
        return _respond(envelope("method_not_allowed"), 405)
    if isinstance(exc, exceptions.Throttled):
        return _respond(envelope("throttled"), 429)
    if isinstance(exc, exceptions.APIException):
        return _respond(envelope("bad_request"), exc.status_code)
    return None
