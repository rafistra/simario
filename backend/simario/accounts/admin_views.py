"""User administration endpoints (FR-ADM-004, 009, 010)."""

from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.core.api import body
from simario.core.permissions import require_permission

from . import admin_services, keycloak
from .models import User


def _user(request: Request) -> User:
    return cast(User, request.user)


class UserInputSerializer(serializers.Serializer[None]):
    nip = serializers.CharField(allow_blank=True)
    full_name = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    org_unit_id = serializers.UUIDField(required=False, allow_null=True)
    is_local_account = serializers.BooleanField()


class CreatedUserSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    temporary_password = serializers.CharField(allow_null=True)


class TemporaryPasswordSerializer(serializers.Serializer[None]):
    temporary_password = serializers.CharField()


class RoleIdsSerializer(serializers.Serializer[None]):
    role_ids = serializers.ListField(child=serializers.UUIDField())


class DeactivationImpactSerializer(serializers.Serializer[None]):
    occupancies = serializers.IntegerField()
    delegations = serializers.IntegerField()
    appointed_operators = serializers.IntegerField()
    filler_block = serializers.CharField(allow_null=True)


class StaffSerializer(serializers.Serializer[None]):
    nip = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.CharField()
    org_unit_id = serializers.CharField()


class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=UserInputSerializer, responses={201: CreatedUserSerializer}, tags=["admin"]
    )
    def post(self, request: Request) -> Response:
        actor = require_permission(_user(request), 21)
        user_id, temp = admin_services.add_user(actor, body(UserInputSerializer, request))
        return Response({"id": user_id, "temporary_password": temp}, status=201)


class UserRolesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=RoleIdsSerializer, responses={204: None}, tags=["admin"])
    def put(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 22)
        role_ids = body(RoleIdsSerializer, request)["role_ids"]
        admin_services.set_manual_roles(actor, pk, role_ids)  # type: ignore[arg-type]
        return Response(status=204)


class UserDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=DeactivationImpactSerializer, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 21)
        return Response(admin_services.deactivate_user(actor, pk))  # type: ignore[arg-type]


class UserReactivateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 21)
        admin_services.reactivate_user(actor, pk)  # type: ignore[arg-type]
        return Response(status=204)


class UserResetPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=TemporaryPasswordSerializer, tags=["admin"])
    def post(self, request: Request, pk: str) -> Response:
        actor = require_permission(_user(request), 21)
        temp = admin_services.reset_password(actor, pk)  # type: ignore[arg-type]
        return Response({"temporary_password": temp})


class StaffSearchView(APIView):
    """Staff directory for the Operator picker (FR-ADM-010); any signed-in user, as in the
    prototype, since Pejabat appoint their own Operators."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("q", str)],
        responses=StaffSerializer(many=True),
        tags=["admin"],
    )
    def get(self, request: Request) -> Response:
        return Response(keycloak.search_staff(request.query_params.get("q", "")))
