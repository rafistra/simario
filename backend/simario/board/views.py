import json
from typing import Any, cast

from django.http import HttpResponse, HttpResponseRedirect
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
from simario.core.api import IdSerializer, body
from simario.core.errors import ApiError
from simario.domain import board as rules

from . import files, selectors, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class BoardView(APIView):
    """GET: the risk board of a position and fiscal year (`BoardView`, FR-PPN-001)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["board"])
    def get(self, request: Request, pk: str, year: int) -> Response:
        return Response(selectors.build_board(_user(request), pk, year))  # type: ignore[arg-type]


class ThreadView(APIView):
    """GET: a risk thread (`ThreadView`, FR-PPN-002). With `?since=`: the count of newer comments
    by others, for the 30-second poll (NFR-015)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("since", str, required=False)],
        responses={200: dict},
        tags=["board"],
    )
    def get(self, request: Request, pk: str) -> Response:
        since = request.query_params.get("since")
        if since:
            return Response(selectors.thread_since(_user(request), pk, since))  # type: ignore[arg-type]
        return Response(selectors.build_thread(_user(request), pk))  # type: ignore[arg-type]


class ParticipantsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("quarterId", str)], responses={200: dict}, tags=["board"]
    )
    def get(self, request: Request, pk: str) -> Response:
        quarter = request.query_params.get("quarterId") or request.query_params.get("quarter_id")
        return Response(selectors.participants(_user(request), pk, quarter or ""))  # type: ignore[arg-type]


class CommentInputSerializer(serializers.Serializer[None]):
    mitigation_id = serializers.UUIDField(allow_null=True, required=False)
    body = serializers.CharField(
        allow_blank=True, trim_whitespace=False, required=False, default=""
    )
    quarter_id = serializers.UUIDField(allow_null=True, required=False)
    is_step = serializers.BooleanField(required=False, default=False)
    mention_user_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    confidential = serializers.ListField(child=serializers.BooleanField(), required=False)


class CommentEditSerializer(serializers.Serializer[None]):
    body = serializers.CharField(allow_blank=True, trim_whitespace=False)


class ConfidentialSerializer(serializers.Serializer[None]):
    is_confidential = serializers.BooleanField()


class CommentListView(APIView):
    """POST multipart: `data` (JSON, camelCase) and `files` (one part per file)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, CamelCaseJSONParser]

    @extend_schema(request=CommentInputSerializer, responses={201: IdSerializer}, tags=["board"])
    def post(self, request: Request, pk: str) -> Response:
        form = cast(dict[str, Any], request.data)
        raw = form.get("data")
        try:
            payload = underscoreize(json.loads(raw)) if isinstance(raw, str) else form
        except json.JSONDecodeError as exc:
            raise ApiError("validation", "Isian komentar tidak valid.") from exc
        s = CommentInputSerializer(data=payload)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        flags = data.pop("confidential", None) or []
        parts = request.FILES.getlist("files")
        # Limits before anything is read into memory (NFR-009).
        if len(parts) > rules.MAX_FILES:
            raise ApiError("validation", f"Maksimal {rules.MAX_FILES} berkas per komentar.")
        for f in parts:
            problem = rules.file_problem(f.name or "", f.size or 0)
            if problem:
                raise ApiError("validation", f"{f.name}: {problem}")
        uploads = [
            services.Upload(f.name or "", f.read(), bool(flags[i]) if i < len(flags) else False)
            for i, f in enumerate(parts)
        ]
        cid = services.post(_user(request), pk, data, uploads)
        return Response({"id": cid}, status=201)


class CommentView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=CommentEditSerializer, responses={204: None}, tags=["board"])
    def patch(self, request: Request, pk: str) -> Response:
        services.edit(_user(request), pk, body(CommentEditSerializer, request)["body"])
        return Response(status=204)


class CommentWithdrawView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["board"])
    def post(self, request: Request, pk: str) -> Response:
        services.withdraw(_user(request), pk)
        return Response(status=204)


class AttachmentView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ConfidentialSerializer, responses={204: None}, tags=["board"])
    def patch(self, request: Request, pk: str) -> Response:
        on = body(ConfidentialSerializer, request)["is_confidential"]
        services.set_confidential(_user(request), pk, on)
        return Response(status=204)


class AttachmentDownloadView(APIView):
    """302 to a 5-minute pre-signed URL under /storage (NFR-011); demo files without content
    answer with a sample file."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={302: None}, tags=["board"])
    def get(self, request: Request, pk: str) -> HttpResponse:
        a = selectors.downloadable(_user(request), pk)  # type: ignore[arg-type]
        if not a.object_key:
            response = HttpResponse(
                f"Berkas contoh SIMARIO: {a.filename}\n", content_type="text/plain; charset=utf-8"
            )
            response["Content-Disposition"] = f'attachment; filename="{a.filename}.txt"'
            return response
        return HttpResponseRedirect(files.presigned_url(a.object_key, a.filename))


class SubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["board"])
    def put(self, request: Request, pk: str) -> Response:
        services.follow(_user(request), pk, True)
        return Response(status=204)

    @extend_schema(responses={204: None}, tags=["board"])
    def delete(self, request: Request, pk: str) -> Response:
        services.follow(_user(request), pk, False)
        return Response(status=204)


class SeenView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["board"])
    def post(self, request: Request, pk: str) -> Response:
        services.mark_seen(_user(request), pk)
        return Response(status=204)
