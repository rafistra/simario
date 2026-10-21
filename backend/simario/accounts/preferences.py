"""Server preferences (spec §4.10): GET all of the signed-in user's, PUT one key."""

from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.core.api import body
from simario.core.errors import ApiError

from .models import Preference, User

MAX_KEY = 128
MAX_BYTES = 8 * 1024


class PreferenceSerializer(serializers.Serializer[None]):
    value = serializers.JSONField(allow_null=True)


class PreferenceListView(APIView):
    """GET: `{key: value}` of the signed-in user. Keys are returned as stored (not camelCased)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["auth"])
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        rows = Preference.objects.filter(user=user).values_list("key", "value")
        return Response({"items": [{"key": k, "value": v} for k, v in rows]})


class PreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PreferenceSerializer, responses={204: None}, tags=["auth"])
    def put(self, request: Request, key: str) -> Response:
        if len(key) > MAX_KEY:
            raise ApiError("validation", "Kunci preferensi terlalu panjang.")
        value: Any = body(PreferenceSerializer, request)["value"]
        if len(str(value)) > MAX_BYTES:
            raise ApiError("validation", "Nilai preferensi terlalu besar.")
        Preference.objects.update_or_create(
            user=cast(User, request.user), key=key, defaults={"value": value}
        )
        return Response(status=204)
