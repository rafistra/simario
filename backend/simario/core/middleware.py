import logging
from collections.abc import Callable

from django.core.exceptions import PermissionDenied
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse

from .errors import envelope

logger = logging.getLogger(__name__)

API_PREFIX = "/api/"


class ApiErrorMiddleware:
    """Keeps /api/ answers in the error envelope even outside DRF views: unknown paths and
    unhandled exceptions (Django would otherwise serve HTML, including DEBUG pages)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if (
            request.path.startswith(API_PREFIX)
            and response.status_code == 404
            and not response.get("Content-Type", "").startswith("application/json")
        ):
            return JsonResponse(envelope("not_found"), status=404)
        return response

    def process_exception(self, request: HttpRequest, exc: Exception) -> HttpResponse | None:
        if not request.path.startswith(API_PREFIX):
            return None
        if isinstance(exc, Http404):
            return JsonResponse(envelope("not_found"), status=404)
        if isinstance(exc, PermissionDenied):
            return JsonResponse(envelope("forbidden"), status=403)
        logger.exception("Unhandled error on %s", request.path)
        return JsonResponse(envelope("server"), status=500)
