import json
from typing import Any, cast

from djangorestframework_camel_case.parser import CamelCaseJSONParser
from djangorestframework_camel_case.util import underscoreize
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.board.services import Upload
from simario.core.api import body
from simario.core.errors import ApiError
from simario.domain import board as board_rules

from . import selectors, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class AssessmentPageView(APIView):
    """GET: the assessment page of a position and quarter (`AssessmentView`, FR-NIL-001). With
    `?blind=1` and permission 24 the Superadmin sees unopened assessments; every such view is
    audit-logged (FR-NIL-012)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("blind", bool, required=False)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request, pk: str, year: int, tw: int) -> Response:
        blind = request.query_params.get("blind") in ("1", "true")
        view = selectors.build_assessment(_user(request), pk, year, tw, blind)  # type: ignore[arg-type]
        if view["blind"]["granted"]:
            services.log_blind_view(_user(request), pk, view["quarter"]["id"])
        return Response(view)


class FinalisePreviewView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("assessorPositionId", str)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request, pk: str, year: int, tw: int) -> Response:
        assessor = request.query_params.get("assessorPositionId") or ""
        return Response(selectors.finalise_preview(_user(request), pk, year, tw, assessor))  # type: ignore[arg-type]


class QueueView(APIView):
    """GET: the Lini 3 queue (`QueueView`, FR-NIL-010)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("quarterId", str, required=False)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request) -> Response:
        quarter = request.query_params.get("quarterId") or None
        return Response(selectors.build_queue(_user(request), quarter))


class CellPatchSerializer(serializers.Serializer[None]):
    score = serializers.FloatField(allow_null=True, required=False)
    not_relevant = serializers.BooleanField(required=False)
    not_relevant_reason = serializers.CharField(
        allow_blank=True, allow_null=True, trim_whitespace=False, required=False
    )
    note = serializers.CharField(allow_blank=True, trim_whitespace=False, required=False)


class CellView(APIView):
    """PATCH: autosave of the viewer's own cell (FR-NIL-002, 005)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=CellPatchSerializer, responses={204: None}, tags=["assessments"])
    def patch(self, request: Request, pk: str, assessor: str) -> Response:
        services.save_cell(_user(request), pk, assessor, body(CellPatchSerializer, request))
        return Response(status=204)


class EvidenceView(APIView):
    """POST (multipart `files`, optional `data` = {"confidential": [bool]}): evidence files."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, CamelCaseJSONParser]

    @extend_schema(request=None, responses={204: None}, tags=["assessments"])
    def post(self, request: Request, pk: str, assessor: str) -> Response:
        form = cast(dict[str, Any], request.data)
        raw = form.get("data")
        try:
            payload = underscoreize(json.loads(raw)) if isinstance(raw, str) else {}
        except json.JSONDecodeError as exc:
            raise ApiError("validation", "Isian lampiran tidak valid.") from exc
        flags = payload.get("confidential") or []
        parts = request.FILES.getlist("files")
        if not parts:
            raise ApiError("validation", "Pilih berkas yang akan dilampirkan.")
        # Limits before anything is read into memory (NFR-009).
        if len(parts) > board_rules.MAX_FILES:
            raise ApiError("validation", f"Maksimal {board_rules.MAX_FILES} berkas per penilaian.")
        for f in parts:
            problem = board_rules.file_problem(f.name or "", f.size or 0)
            if problem:
                raise ApiError("validation", f"{f.name}: {problem}")
        uploads = [
            Upload(f.name or "", f.read(), bool(flags[i]) if i < len(flags) else True)
            for i, f in enumerate(parts)
        ]
        services.add_files(_user(request), pk, assessor, uploads)
        return Response(status=204)


class EvidenceFileView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None}, tags=["assessments"])
    def delete(self, request: Request, pk: str) -> Response:
        services.remove_file(_user(request), pk)
        return Response(status=204)


class CountSerializer(serializers.Serializer[None]):
    count = serializers.IntegerField()


class ReadyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: CountSerializer}, tags=["assessments"])
    def post(self, request: Request, pk: str, quarter: str, assessor: str) -> Response:
        n = services.mark_ready(_user(request), pk, quarter, assessor)
        return Response({"count": n})


class FinaliseView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: dict}, tags=["assessments"])
    def post(self, request: Request, pk: str, quarter: str, assessor: str) -> Response:
        return Response(services.finalise(_user(request), pk, quarter, assessor))


class ReopenView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["assessments"])
    def post(self, request: Request, pk: str) -> Response:
        services.reopen(_user(request), pk)
        return Response(status=204)


class ExplanationPatchSerializer(serializers.Serializer[None]):
    reason = serializers.CharField(allow_blank=True, trim_whitespace=False, required=False)
    plan = serializers.CharField(allow_blank=True, trim_whitespace=False, required=False)


class ExplanationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ExplanationPatchSerializer, responses={204: None}, tags=["assessments"])
    def patch(self, request: Request, pk: str) -> Response:
        services.save_explanation(_user(request), pk, body(ExplanationPatchSerializer, request))
        return Response(status=204)


class ResultIdsSerializer(serializers.Serializer[None]):
    result_ids = serializers.ListField(child=serializers.UUIDField())


class ExplanationsReadyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ResultIdsSerializer, responses={204: None}, tags=["assessments"])
    def post(self, request: Request, pk: str) -> Response:
        ids = body(ResultIdsSerializer, request)["result_ids"]
        services.mark_explanations_ready(_user(request), pk, ids)
        return Response(status=204)


class ExplanationsSendView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ResultIdsSerializer, responses={200: CountSerializer}, tags=["assessments"]
    )
    def post(self, request: Request, pk: str) -> Response:
        ids = body(ResultIdsSerializer, request)["result_ids"]
        return Response({"count": services.send_explanations(_user(request), pk, ids)})


class HistoryView(APIView):
    """GET: the risk history of a position and fiscal year (`HistoryView`, FR-RWY-001)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["assessments"])
    def get(self, request: Request, pk: str, year: int) -> Response:
        from .history import build_history

        return Response(build_history(_user(request), pk, year))  # type: ignore[arg-type]
