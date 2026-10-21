from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import IdSerializer, ReasonSerializer, body
from simario.reference.models import RISK_TYPES

from . import selectors, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class SelectedSerializer(serializers.Serializer[None]):
    selected = serializers.BooleanField()


class CustomRiskSerializer(serializers.Serializer[None]):
    stage_id = serializers.UUIDField()
    risk_type = serializers.ChoiceField(choices=RISK_TYPES)
    description = serializers.CharField(allow_blank=True, trim_whitespace=False)


class TextSerializer(serializers.Serializer[None]):
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)


class DeclarationSerializer(serializers.Serializer[None]):
    stage_id = serializers.UUIDField()
    risk_type = serializers.ChoiceField(choices=RISK_TYPES, allow_null=True)
    on = serializers.BooleanField()
    force = serializers.BooleanField(required=False, default=False)


class DeclarationReasonSerializer(serializers.Serializer[None]):
    stage_id = serializers.UUIDField()
    risk_type = serializers.ChoiceField(choices=RISK_TYPES, allow_null=True)
    reason = serializers.CharField(allow_blank=True, trim_whitespace=False)


class DataUmumPatchSerializer(serializers.Serializer[None]):
    tujuan = serializers.CharField(allow_blank=True, required=False, trim_whitespace=False)
    kegiatan = serializers.ListField(
        child=serializers.CharField(allow_blank=True, trim_whitespace=False), required=False
    )
    besar_anggaran = serializers.FloatField(allow_null=True, required=False)
    target = serializers.CharField(allow_blank=True, required=False, trim_whitespace=False)
    extra = serializers.DictField(
        child=serializers.CharField(allow_blank=True, trim_whitespace=False), required=False
    )


class PublishSummarySerializer(serializers.Serializer[None]):
    risks = serializers.IntegerField()
    mitigations = serializers.IntegerField()
    flagged = serializers.ListField(child=serializers.DictField())
    proposals = serializers.IntegerField()


class CopySummarySerializer(serializers.Serializer[None]):
    risks = serializers.IntegerField()
    mitigations = serializers.IntegerField()
    inactive_templates = serializers.IntegerField()
    skipped_stages = serializers.ListField(child=serializers.DictField())
    from_year = serializers.IntegerField()


def _whole_budget(data: dict[str, Any]) -> dict[str, Any]:
    """Whole-rupiah budgets stay integers in JSON."""
    budget = data.get("besar_anggaran")
    if isinstance(budget, float) and budget.is_integer():
        data["besar_anggaran"] = int(budget)
    return data


class RegisterView(APIView):
    """GET: the register as the signed-in viewer may see it (`RegisterView`, FR-REG-012).
    PATCH: Data Umum."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["registers"])
    def get(self, request: Request, pk: str, year: int) -> Response:
        return Response(selectors.build_register_view(_user(request), pk, year))  # type: ignore[arg-type]

    @extend_schema(request=DataUmumPatchSerializer, responses={204: None}, tags=["registers"])
    def patch(self, request: Request, pk: str, year: int) -> Response:
        patch = _whole_budget(body(DataUmumPatchSerializer, request))
        services.update_data_umum(_user(request), pk, year, patch)
        return Response(status=204)


class TemplateRiskView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=SelectedSerializer, responses={204: None}, tags=["registers"])
    def put(self, request: Request, pk: str, year: int, template_id: str) -> Response:
        selected = body(SelectedSerializer, request)["selected"]
        services.toggle_template_risk(_user(request), pk, year, template_id, selected)
        return Response(status=204)


class CustomRiskView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=CustomRiskSerializer, responses={201: IdSerializer}, tags=["registers"])
    def post(self, request: Request, pk: str, year: int) -> Response:
        b = body(CustomRiskSerializer, request)
        rid = services.add_custom_risk(
            _user(request), pk, year, b["stage_id"], b["risk_type"], b["description"]
        )
        return Response({"id": rid}, status=201)


class DeclarationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=DeclarationSerializer, responses={204: None}, tags=["registers"])
    def put(self, request: Request, pk: str, year: int) -> Response:
        b = body(DeclarationSerializer, request)
        services.set_declaration(
            _user(request), pk, year, b["stage_id"], b["risk_type"], b["on"], b["force"]
        )
        return Response(status=204)

    @extend_schema(request=DeclarationReasonSerializer, responses={204: None}, tags=["registers"])
    def patch(self, request: Request, pk: str, year: int) -> Response:
        b = body(DeclarationReasonSerializer, request)
        services.set_declaration_reason(
            _user(request), pk, year, b["stage_id"], b["risk_type"], b["reason"]
        )
        return Response(status=204)


class MarkReadyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["registers"])
    def post(self, request: Request, pk: str, year: int) -> Response:
        services.mark_ready(_user(request), pk, year)
        return Response(status=204)


class PublishView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=PublishSummarySerializer, tags=["registers"])
    def post(self, request: Request, pk: str, year: int) -> Response:
        return Response(services.publish(_user(request), pk, year))


class CopyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=CopySummarySerializer, tags=["registers"])
    def post(self, request: Request, pk: str, year: int) -> Response:
        return Response(services.copy_from_previous(_user(request), pk, year))


class RiskView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None}, tags=["registers"])
    def delete(self, request: Request, pk: str) -> Response:
        services.delete_risk(_user(request), pk)
        return Response(status=204)


class TemplateMitigationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=SelectedSerializer, responses={204: None}, tags=["registers"])
    def put(self, request: Request, pk: str, template_id: str) -> Response:
        selected = body(SelectedSerializer, request)["selected"]
        services.toggle_template_mitigation(_user(request), pk, template_id, selected)
        return Response(status=204)


class CustomMitigationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=TextSerializer, responses={204: None}, tags=["registers"])
    def post(self, request: Request, pk: str) -> Response:
        services.add_custom_mitigation(_user(request), pk, body(TextSerializer, request)["text"])
        return Response(status=204)


class RiskDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ReasonSerializer, responses={204: None}, tags=["registers"])
    def post(self, request: Request, pk: str) -> Response:
        services.deactivate_risk(_user(request), pk, body(ReasonSerializer, request)["reason"])
        return Response(status=204)


class MitigationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None}, tags=["registers"])
    def delete(self, request: Request, pk: str) -> Response:
        services.delete_mitigation(_user(request), pk)
        return Response(status=204)


class MitigationDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ReasonSerializer, responses={204: None}, tags=["registers"])
    def post(self, request: Request, pk: str) -> Response:
        services.deactivate_mitigation(
            _user(request), pk, body(ReasonSerializer, request)["reason"]
        )
        return Response(status=204)
