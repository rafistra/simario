from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import ActiveSerializer, IdSerializer, ReasonSerializer, body
from simario.core.permissions import require_permission

from . import proposals, services

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


# ---------- Score bands and statements ----------

PREDICATES = ["kurang", "cukup", "terkendali"]


class BandInputSerializer(serializers.Serializer[None]):
    lower_exclusive = serializers.FloatField(allow_null=True)
    upper_inclusive = serializers.FloatField()
    predicate = serializers.ChoiceField(choices=PREDICATES)
    order = serializers.IntegerField()
    guidance = serializers.CharField(allow_blank=True, required=False, default="")


class OptionInputSerializer(serializers.Serializer[None]):
    id = serializers.CharField()
    value = serializers.FloatField()
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)  # type: ignore[assignment]


class BandDraftCreateSerializer(serializers.Serializer[None]):
    effective_from = serializers.DateField()


class BandVersionSerializer(serializers.Serializer[None]):
    effective_from = serializers.DateField()
    bands = BandInputSerializer(many=True)
    options = OptionInputSerializer(many=True)


class GuidanceSerializer(serializers.Serializer[None]):
    guidance = serializers.CharField(allow_blank=True, trim_whitespace=False)


class LabelSerializer(serializers.Serializer[None]):
    label = serializers.CharField(allow_blank=True, trim_whitespace=False)  # type: ignore[assignment]


def _version_input(request: Request) -> dict[str, Any]:
    b = body(BandVersionSerializer, request)
    return {
        "effective_from": b["effective_from"],
        "bands": [dict(x) for x in b["bands"]],
        "options": [dict(x) for x in b["options"]],
    }


class BandVersionListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=BandDraftCreateSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request) -> Response:
        actor = _actor(request, 14)
        effective = body(BandDraftCreateSerializer, request)["effective_from"]
        return Response({"id": services.create_band_draft(actor, effective)})


class BandVersionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=BandVersionSerializer, responses={204: None}, tags=["master"])
    def put(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 14)
        v = _version_input(request)
        services.update_band_draft(actor, pk, v["bands"], v["effective_from"], v["options"])
        return Response(status=204)

    @extend_schema(responses={204: None}, tags=["master"])
    def delete(self, request: Request, pk: Any) -> Response:
        services.discard_band_draft(_actor(request, 14), pk)
        return Response(status=204)


class BandVersionScheduleView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=BandVersionSerializer, responses={204: None}, tags=["master"])
    def post(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 14)
        v = _version_input(request)
        services.save_band_version(actor, pk, v["effective_from"], v["bands"], v["options"])
        return Response(status=204)


class ActiveGuidanceView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=GuidanceSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, predicate: str) -> Response:
        actor = _actor(request, 14)
        services.update_active_guidance(
            actor, predicate, body(GuidanceSerializer, request)["guidance"]
        )
        return Response(status=204)


class OptionLabelView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=LabelSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 14)
        services.update_option_label(actor, pk, body(LabelSerializer, request)["label"])
        return Response(status=204)


class ProposalRowSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    source_register_risk_id = serializers.UUIDField()
    description = serializers.CharField()
    proposer_user_id = serializers.UUIDField()
    proposer_name = serializers.CharField()
    status = serializers.CharField()
    rejection_reason = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    position_id = serializers.UUIDField()
    position_name = serializers.CharField()
    position_type_id = serializers.UUIDField()
    position_type_name = serializers.CharField()
    stage_id = serializers.UUIDField()
    stage_name = serializers.CharField()
    risk_type = serializers.CharField()
    mitigations = serializers.ListField(child=serializers.CharField())


class ProposalListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ProposalRowSerializer(many=True), tags=["master"])
    def get(self, request: Request) -> Response:
        _actor(request, 13)
        rows = proposals.list_proposals(request.query_params.get("status"))
        return Response(ProposalRowSerializer(rows, many=True).data)


class ProposalRejectView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ReasonSerializer, responses={204: None}, tags=["master"])
    def post(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 13)
        proposals.reject_proposal(actor, pk, body(ReasonSerializer, request)["reason"])
        return Response(status=204)


class ProposalAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=TemplateSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request, pk: Any) -> Response:
        actor = _actor(request, 12, 13)
        tid = proposals.accept_proposal(actor, pk, body(TemplateSerializer, request))
        return Response({"id": tid})
