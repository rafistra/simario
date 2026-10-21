import datetime as dt
from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import ReasonSerializer, body
from simario.core.permissions import require_permission

from . import services


def _user(request: Request) -> User:
    return cast(User, request.user)


class YearSerializer(serializers.Serializer[None]):
    year = serializers.IntegerField(min_value=2000, max_value=2100)


class FiscalYearPatchSerializer(serializers.Serializer[None]):
    tolerance_days = serializers.IntegerField(required=False)
    archive_grace_days = serializers.IntegerField(required=False)


class QuarterPatchSerializer(serializers.Serializer[None]):
    starts_on = serializers.DateField(required=False)
    ends_on = serializers.DateField(required=False)
    lini1_opens_on = serializers.DateField(required=False)
    lini1_deadline = serializers.DateField(required=False)
    lini3_opens_on = serializers.DateField(required=False)
    lini3_deadline = serializers.DateField(required=False)
    explanation_workdays = serializers.IntegerField(required=False)
    confirm_past_deadline = serializers.BooleanField(required=False, default=False)


class ArchiveStatusSerializer(serializers.Serializer[dict[str, Any]]):
    year = serializers.IntegerField()
    status = serializers.CharField()
    tw4_complete = serializers.BooleanField()
    blockers = serializers.ListField(child=serializers.CharField())
    base_hard_limit = serializers.DateField()
    projected = serializers.DateField()


class FiscalYearListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=YearSerializer, responses={204: None}, tags=["admin"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 19)
        services.create_fiscal_year(actor, body(YearSerializer, request)["year"])
        return Response(status=204)


class FiscalYearView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=FiscalYearPatchSerializer, responses={204: None}, tags=["admin"])
    def patch(self, request: Request, year: int) -> Response:
        actor = require_permission(_user(request), 19)
        services.update_fiscal_year(actor, year, body(FiscalYearPatchSerializer, request))
        return Response(status=204)


class QuarterView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=QuarterPatchSerializer, responses={204: None}, tags=["admin"])
    def patch(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 19)
        data = body(QuarterPatchSerializer, request)
        confirm = data.pop("confirm_past_deadline", False)
        services.update_quarter(actor, pk, data, confirm)  # type: ignore[arg-type]
        return Response(status=204)


class ExcludeAssessorView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ReasonSerializer, responses={204: None}, tags=["admin"])
    def post(self, request: Request, pk: str, position_id: str) -> Response:
        actor = require_permission(_user(request), 19)
        reason = body(ReasonSerializer, request)["reason"]
        services.exclude_assessor(actor, pk, position_id, reason)  # type: ignore[arg-type]
        return Response(status=204)


class ArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["admin"])
    def post(self, request: Request, year: int) -> Response:
        actor = require_permission(_user(request), 26)
        services.archive_manually(actor, year)
        return Response(status=204)


class ArchiveStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ArchiveStatusSerializer, tags=["admin"])
    def get(self, request: Request, year: int) -> Response:
        actor = require_permission(_user(request), 19, 26)
        status = services.archive_status(year, dt.date.fromisoformat(actor.today))
        return Response(ArchiveStatusSerializer(status).data)
