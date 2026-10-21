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

from . import holdings, roles, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class PositionInputSerializer(serializers.Serializer[None]):
    position_type_id = serializers.UUIDField(required=False, allow_null=True)
    code = serializers.CharField(allow_blank=True)
    name = serializers.CharField(allow_blank=True)
    org_unit_id = serializers.UUIDField(required=False, allow_null=True)
    identity = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)


class ImpactSerializer(serializers.Serializer[None]):
    published_registers = serializers.ListField(child=serializers.DictField())
    active_operators = serializers.IntegerField()


class PositionTypeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ActiveSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 17)
        services.set_position_type_active(actor, pk, body(ActiveSerializer, request)["active"])  # type: ignore[arg-type]
        return Response(status=204)


class PositionListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PositionInputSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 18)
        return Response(
            {"id": services.save_position(actor, body(PositionInputSerializer, request))}
        )


class PositionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PositionInputSerializer, responses=IdSerializer, tags=["master"])
    def put(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        data = body(PositionInputSerializer, request)
        return Response({"id": services.save_position(actor, data, pk)})  # type: ignore[arg-type]


class PositionImpactView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ImpactSerializer, tags=["master"])
    def get(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        return Response(services.position_impact(pk, actor.today))  # type: ignore[arg-type]


class PositionDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ReasonSerializer, responses={204: None}, tags=["master"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        services.deactivate_position(actor, pk, body(ReasonSerializer, request)["reason"])  # type: ignore[arg-type]
        return Response(status=204)


class PositionReactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["master"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        services.reactivate_position(actor, pk)  # type: ignore[arg-type]
        return Response(status=204)


class AssignInputSerializer(serializers.Serializer[None]):
    user_id = serializers.UUIDField()
    position_id = serializers.UUIDField()
    decree_no = serializers.CharField(allow_blank=True)
    decree_date = serializers.DateField(allow_null=True)
    decree_file = serializers.CharField(allow_null=True, required=False)
    start_date = serializers.DateField()
    is_filler = serializers.BooleanField()


class AssignResultSerializer(serializers.Serializer[None]):
    occupancy_id = serializers.UUIDField()
    promoted = serializers.IntegerField()
    filler_changed = serializers.IntegerField()


class ReplaceInputSerializer(serializers.Serializer[None]):
    outgoing_occupancy_id = serializers.UUIDField()
    incoming_user_id = serializers.UUIDField()
    effective_date = serializers.DateField()
    decree_no = serializers.CharField(allow_blank=True)
    decree_date = serializers.DateField(allow_null=True)
    decree_file = serializers.CharField(allow_null=True, required=False)


class ReplaceResultSerializer(serializers.Serializer[None]):
    operators_ended = serializers.IntegerField()
    promoted = serializers.IntegerField()


class FillerInputSerializer(serializers.Serializer[None]):
    to_occupancy_id = serializers.UUIDField()


class OperatorsEndedSerializer(serializers.Serializer[None]):
    operators_ended = serializers.IntegerField()


class AppointInputSerializer(serializers.Serializer[None]):
    nip = serializers.CharField(allow_blank=True)
    letter_no = serializers.CharField(allow_blank=True)
    letter_date = serializers.DateField(allow_null=True)
    letter_file = serializers.CharField(allow_blank=True, allow_null=True)
    end_date = serializers.DateField(allow_null=True, required=False)


class OperatorRowSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    full_name = serializers.CharField()
    letter_no = serializers.CharField()
    letter_date = serializers.DateField(allow_null=True)
    start_date = serializers.DateField()
    end_date = serializers.DateField(allow_null=True)
    end_reason = serializers.CharField(allow_null=True)
    current = serializers.BooleanField()


class OfficialCardSerializer(serializers.Serializer[None]):
    occupancy_id = serializers.UUIDField()
    position_id = serializers.UUIDField()
    position_name = serializers.CharField()
    line = serializers.IntegerField()
    decree_no = serializers.CharField()
    decree_date = serializers.DateField(allow_null=True)
    has_decree_file = serializers.BooleanField()
    start_date = serializers.DateField()
    is_filler = serializers.BooleanField()
    is_multi = serializers.BooleanField()
    can_manage = serializers.BooleanField()
    operators = OperatorRowSerializer(many=True)


class OperatorCardSerializer(serializers.Serializer[None]):
    delegate_id = serializers.UUIDField()
    position_id = serializers.UUIDField()
    position_name = serializers.CharField()
    line = serializers.IntegerField()
    appointed_by = serializers.CharField()
    letter_no = serializers.CharField()
    letter_date = serializers.DateField(allow_null=True)
    start_date = serializers.DateField()
    end_date = serializers.DateField(allow_null=True)


class MyPositionsSerializer(serializers.Serializer[dict[str, Any]]):
    officials = OfficialCardSerializer(many=True)
    operator_of = OperatorCardSerializer(many=True)


class OccupancyListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=AssignInputSerializer, responses=AssignResultSerializer, tags=["admin"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 21)
        return Response(holdings.assign_position(actor, body(AssignInputSerializer, request)))


class ReplaceOfficialView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ReplaceInputSerializer, responses=ReplaceResultSerializer, tags=["admin"]
    )
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 21)
        data = body(ReplaceInputSerializer, request)
        return Response(holdings.replace_official(actor, pk, data))  # type: ignore[arg-type]


class FillerView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=FillerInputSerializer, responses=OperatorsEndedSerializer, tags=["admin"]
    )
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 21)
        to = body(FillerInputSerializer, request)["to_occupancy_id"]
        return Response({"operators_ended": holdings.move_filler(actor, pk, to)})  # type: ignore[arg-type]


class DelegateListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=AppointInputSerializer, responses={201: IdSerializer}, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        data = body(AppointInputSerializer, request)
        user_id = holdings.appoint_operator(_user(request), pk, data)  # type: ignore[arg-type]
        return Response({"id": user_id}, status=201)


class DelegateRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        holdings.revoke_operator(_user(request), pk)  # type: ignore[arg-type]
        return Response(status=204)


class MyPositionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MyPositionsSerializer, tags=["admin"])
    def get(self, request: Request) -> Response:
        return Response(MyPositionsSerializer(holdings.my_positions(_user(request))).data)


class RoleNameSerializer(serializers.Serializer[None]):
    name = serializers.CharField(allow_blank=True)


class PermissionInputSerializer(serializers.Serializer[None]):
    enabled = serializers.BooleanField()
    scope = serializers.ChoiceField(
        choices=["sendiri", "unit", "semua"], allow_null=True, required=False
    )


class SupportInputSerializer(serializers.Serializer[None]):
    position_id = serializers.UUIDField()
    domain = serializers.ChoiceField(choices=["budget_performance", "procurement"])


class AssignmentsInputSerializer(serializers.Serializer[None]):
    target_position_ids = serializers.ListField(child=serializers.UUIDField())
    lead_position_id = serializers.UUIDField(allow_null=True)
    supports = SupportInputSerializer(many=True, required=False)
    quarter_from_id = serializers.CharField()
    quarter_to_id = serializers.CharField()
    decree_no = serializers.CharField(allow_blank=True)


class RoleListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=RoleNameSerializer, responses={201: IdSerializer}, tags=["admin"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 22)
        name = body(RoleNameSerializer, request)["name"]
        return Response({"id": roles.add_role(actor, name)}, status=201)


class RoleView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None}, tags=["admin"])
    def delete(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 22)
        roles.delete_role(actor, pk)  # type: ignore[arg-type]
        return Response(status=204)


class RolePermissionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PermissionInputSerializer, responses={204: None}, tags=["admin"])
    def put(self, request: Request, pk: str, code: int) -> Response:
        actor = require_permission(_user(request), 22)
        data = body(PermissionInputSerializer, request)
        roles.set_permission(actor, pk, code, data["enabled"], data.get("scope"))  # type: ignore[arg-type]
        return Response(status=204)


class AssignmentListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=AssignmentsInputSerializer, responses={204: None}, tags=["admin"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 20)
        roles.add_assignments(actor, body(AssignmentsInputSerializer, request))
        return Response(status=204)


class AssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None}, tags=["admin"])
    def delete(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 20)
        roles.remove_assignment(actor, pk)  # type: ignore[arg-type]
        return Response(status=204)
