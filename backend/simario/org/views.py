from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.permissions import require_permission

from . import services


def _user(request: Request) -> User:
    return cast(User, request.user)


class ActiveSerializer(serializers.Serializer[None]):
    active = serializers.BooleanField()


class PositionInputSerializer(serializers.Serializer[None]):
    position_type_id = serializers.UUIDField(required=False, allow_null=True)
    code = serializers.CharField(allow_blank=True)
    name = serializers.CharField(allow_blank=True)
    org_unit_id = serializers.UUIDField(required=False, allow_null=True)
    identity = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)


class IdSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()


class ReasonSerializer(serializers.Serializer[None]):
    reason = serializers.CharField(allow_blank=True, trim_whitespace=False)


class ImpactSerializer(serializers.Serializer[None]):
    published_registers = serializers.ListField(child=serializers.DictField())
    active_operators = serializers.IntegerField()


def _body(serializer: type[serializers.Serializer[None]], request: Request) -> dict[str, Any]:
    body = serializer(data=request.data)
    body.is_valid(raise_exception=True)
    return dict(body.validated_data)


class PositionTypeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ActiveSerializer, responses={204: None}, tags=["master"])
    def patch(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 17)
        services.set_position_type_active(actor, pk, _body(ActiveSerializer, request)["active"])  # type: ignore[arg-type]
        return Response(status=204)


class PositionListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PositionInputSerializer, responses=IdSerializer, tags=["master"])
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 18)
        return Response(
            {"id": services.save_position(actor, _body(PositionInputSerializer, request))}
        )


class PositionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PositionInputSerializer, responses=IdSerializer, tags=["master"])
    def put(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        data = _body(PositionInputSerializer, request)
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
        services.deactivate_position(actor, pk, _body(ReasonSerializer, request)["reason"])  # type: ignore[arg-type]
        return Response(status=204)


class PositionReactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["master"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 18)
        services.reactivate_position(actor, pk)  # type: ignore[arg-type]
        return Response(status=204)
