from typing import Any, cast

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import body
from simario.core.errors import ApiError
from simario.core.permissions import require_permission

from . import services
from .models import ImportJob


def _user(request: Request) -> User:
    return cast(User, request.user)


class ImportInputSerializer(serializers.Serializer[None]):
    kind = serializers.ChoiceField(choices=ImportJob.KINDS)
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)


class ImportErrorSerializer(serializers.Serializer[None]):
    row = serializers.IntegerField()
    column = serializers.CharField()
    message = serializers.CharField()


class ImportJobSerializer(serializers.ModelSerializer[ImportJob]):
    errors = ImportErrorSerializer(many=True)  # type: ignore[assignment]

    class Meta:
        model = ImportJob
        fields = ["id", "kind", "status", "rows", "valid", "errors", "created_at", "applied_at"]


class ImportHistorySerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    at = serializers.DateTimeField(source="applied_at")
    actor = serializers.CharField(source="created_by.full_name")
    kind = serializers.CharField()
    rows = serializers.IntegerField()


class ImportListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ImportHistorySerializer(many=True), tags=["admin"])
    def get(self, request: Request) -> Response:
        require_permission(_user(request), *services.PERMISSION.values())
        return Response(ImportHistorySerializer(services.history(), many=True).data)

    @extend_schema(
        request=ImportInputSerializer, responses={201: ImportJobSerializer}, tags=["admin"]
    )
    def post(self, request: Request) -> Response:
        data = body(ImportInputSerializer, request)
        job = services.dry_run(_user(request), data["kind"], data["text"])
        return Response(ImportJobSerializer(job).data, status=201)


class ImportCommitView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=ImportJobSerializer, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        job = services.commit(_user(request), pk)  # type: ignore[arg-type]
        return Response(ImportJobSerializer(job).data)


class ImportKindsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses=serializers.ListSerializer(
            child=serializers.ChoiceField(choices=ImportJob.KINDS)
        ),
        tags=["admin"],
    )
    def get(self, request: Request) -> Response:
        return Response(services.kinds_for(_user(request)))


class ImportTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={(200, "text/csv"): OpenApiResponse(response=str)}, tags=["admin"])
    def get(self, request: Request, kind: str) -> HttpResponse:
        if kind not in services.PERMISSION:
            raise ApiError("not_found", "Data tidak ditemukan.")
        require_permission(_user(request), services.PERMISSION[kind])
        response = HttpResponse(services.csv_template(kind), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="templat_{kind}.csv"'
        return response
