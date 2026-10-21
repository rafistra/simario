from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import ActiveSerializer, IdSerializer, body
from simario.core.permissions import require_permission

from . import services

RISK_TYPES = ["kinerja_anggaran", "ketidakpatuhan", "kecurangan"]


def _actor(request: Request, *codes: int) -> Any:
    return require_permission(cast(User, request.user), *codes)


class StageCreateSerializer(serializers.Serializer[None]):
    position_type_id = serializers.UUIDField()
    name = serializers.CharField(allow_blank=True, trim_whitespace=False)


class StagePatchSerializer(serializers.Serializer[None]):
    name = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    active = serializers.BooleanField(required=False)


class StageOrderSerializer(serializers.Serializer[None]):
    ordered_ids = serializers.ListField(child=serializers.UUIDField())


class TemplateSerializer(serializers.Serializer[None]):
    position_type_id = serializers.UUIDField()
    stage_id = serializers.UUIDField()
    risk_type = serializers.ChoiceField(choices=RISK_TYPES)
    description = serializers.CharField(allow_blank=True, trim_whitespace=False)
    mitigations = serializers.ListField(
        child=serializers.CharField(allow_blank=True, trim_whitespace=False), required=False
    )


class DataUmumFieldSerializer(serializers.Serializer[None]):
    key = serializers.CharField(allow_blank=True, required=False)
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)  # type: ignore[assignment]
    kind = serializers.ChoiceField(choices=["text", "number", "currency", "date", "list"])
    mandatory = serializers.BooleanField()
    options = serializers.ListField(child=serializers.CharField(allow_blank=True), required=False)


class DataUmumFormSerializer(serializers.Serializer[None]):
    default_objective = serializers.CharField(allow_blank=True, trim_whitespace=False)
    fields = DataUmumFieldSerializer(many=True)  # type: ignore[assignment]
    objective_enabled = serializers.BooleanField(required=False, default=False)


class VersionSerializer(serializers.Serializer[None]):
    version = serializers.IntegerField()


class StageListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=StageCreateSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request) -> Response:
        actor = _actor(request, 15)
        b = body(StageCreateSerializer, request)
        return Response({"id": services.add_stage(actor, b["position_type_id"], b["name"])})


class StageView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=StagePatchSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 15)
        b = body(StagePatchSerializer, request)
        if "name" in b:
            services.rename_stage(actor, pk, b["name"])
        if "active" in b:
            services.set_stage_active(actor, pk, b["active"])
        return Response(status=204)

    @extend_schema(responses={204: None}, tags=["master"])
    def delete(self, request: Request, pk: Any) -> Response:
        services.delete_stage(_actor(request, 15), pk)
        return Response(status=204)


class StageOrderView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=StageOrderSerializer, responses={204: None}, tags=["master"])
    def put(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 15)
        ids = [str(i) for i in body(StageOrderSerializer, request)["ordered_ids"]]
        services.reorder_stages(actor, pk, ids)
        return Response(status=204)


class TemplateListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=TemplateSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request) -> Response:
        actor = _actor(request, 12)
        return Response({"id": services.save_template(actor, body(TemplateSerializer, request))})


class TemplateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=TemplateSerializer, responses=IdSerializer, tags=["master"])
    def put(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 12)
        data = body(TemplateSerializer, request)
        return Response({"id": services.save_template(actor, data, pk)})

    @extend_schema(request=ActiveSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 12)
        services.set_template_active(actor, pk, body(ActiveSerializer, request)["active"])
        return Response(status=204)

    @extend_schema(responses={204: None}, tags=["master"])
    def delete(self, request: Request, pk: Any) -> Response:
        services.delete_template(_actor(request, 12), pk)
        return Response(status=204)


class TemplateUsageView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["master"])
    def get(self, request: Request) -> Response:
        year = int(
            request.query_params.get("fiscal_year") or request.query_params.get("fiscalYear") or 0
        )
        return Response(services.template_usage(year))


class DataUmumFormView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=DataUmumFormSerializer, responses=VersionSerializer, tags=["master"])
    def post(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 16)
        b = body(DataUmumFormSerializer, request)
        version = services.save_data_umum_form(
            actor,
            pk,
            b["default_objective"],
            [dict(f) for f in b["fields"]],
            b.get("objective_enabled", False),
        )
        return Response({"version": version})
