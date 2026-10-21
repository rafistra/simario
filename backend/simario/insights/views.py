from typing import cast

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.board.selectors import now_iso
from simario.core.errors import ApiError
from simario.domain import access

from . import audit_trail
from .metrics import build_metrics, metrics_csv


def _user(request: Request) -> User:
    return cast(User, request.user)


def _metrics(user: User, year: int) -> list[dict[str, object]]:
    """FR-ADM-011: permission 22."""
    from simario.assessments.selectors import assessment_db

    at = now_iso()
    if not access.has_permission(load_access_db(), str(user.id), 22, at[:10]):
        raise ApiError("forbidden", "Anda tidak memiliki izin untuk tindakan ini.")
    return build_metrics(assessment_db(), year, at)


class MetricsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["insights"])
    def get(self, request: Request, year: int) -> Response:
        return Response(_metrics(_user(request), year))


class MetricsCsvView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: str}, tags=["insights"])
    def get(self, request: Request, year: int) -> HttpResponse:
        body = metrics_csv(_metrics(_user(request), year), year)
        response = HttpResponse(body, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="metrik-simario-{year}.csv"'
        return response


FILTERS = ("from", "to", "actor", "position", "entityType", "action")


class AuditView(APIView):
    """GET: the audit trail (FR-ADM-008), redacted per VIS-8 unless `original=1` (izin 24,
    logged)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter(k, str, required=False) for k in (*FILTERS, "original")],
        responses={200: dict},
        tags=["insights"],
    )
    def get(self, request: Request) -> Response:
        p = request.query_params
        f = {("entity_type" if k == "entityType" else k): p.get(k) for k in FILTERS if p.get(k)}
        original = p.get("original") in ("1", "true")
        return Response(audit_trail.build_audit(_user(request), f, original))


class AuditFacetsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["insights"])
    def get(self, request: Request) -> Response:
        return Response(audit_trail.facets(_user(request)))
