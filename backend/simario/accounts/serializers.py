from typing import Any

from rest_framework import serializers

from simario.calendar.serializers import QuarterSerializer
from simario.org.serializers import PositionSerializer


class LoginSerializer(serializers.Serializer[None]):
    nip = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class SignInResultSerializer(serializers.Serializer[None]):
    ok = serializers.BooleanField()
    user_id = serializers.UUIDField()


class PasswordSerializer(serializers.Serializer[None]):
    old_password = serializers.CharField(required=False, trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class AuthConfigSerializer(serializers.Serializer[None]):
    dev_tools = serializers.BooleanField()
    oidc_enabled = serializers.BooleanField()


class MeUserSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    nip = serializers.CharField()
    email = serializers.CharField()
    full_name = serializers.CharField()
    is_local_account = serializers.BooleanField()
    must_change_password = serializers.BooleanField()
    org_unit_id = serializers.UUIDField(allow_null=True)


class HoldingSerializer(serializers.Serializer[None]):
    kind = serializers.ChoiceField(choices=["occupancy", "delegate"])
    id = serializers.UUIDField()
    position_id = serializers.UUIDField()
    capacity = serializers.ChoiceField(choices=["pejabat", "operator"])
    line = serializers.IntegerField()
    is_filler = serializers.BooleanField()
    position = PositionSerializer()
    unit_code = serializers.CharField()
    official_name = serializers.CharField(allow_null=True)
    role_view = serializers.CharField(allow_null=True)


class PermissionScopeSerializer(serializers.Serializer[None]):
    code = serializers.IntegerField()
    scope = serializers.CharField(allow_null=True)


class MeSerializer(serializers.Serializer[dict[str, Any]]):
    """Response of GET /api/v1/me (`MeResponse` in the generated TypeScript types)."""

    user = MeUserSerializer()
    server_now = serializers.CharField()
    today = serializers.CharField()
    dev_tools = serializers.BooleanField()
    holdings = HoldingSerializer(many=True)
    active_position_id = serializers.UUIDField(allow_null=True)
    permissions = PermissionScopeSerializer(many=True)
    role_views = serializers.ListField(child=serializers.CharField())
    current_quarter = QuarterSerializer(allow_null=True)


class ActivePositionSerializer(serializers.Serializer[None]):
    position_id = serializers.UUIDField()


class LogoutResultSerializer(serializers.Serializer[None]):
    redirect_url = serializers.CharField(allow_null=True)
