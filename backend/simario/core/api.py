"""Small request/response serializers and helpers shared by the module views."""

from typing import Any

from rest_framework import serializers
from rest_framework.request import Request


class IdSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()


class ActiveSerializer(serializers.Serializer[None]):
    active = serializers.BooleanField()


class ReasonSerializer(serializers.Serializer[None]):
    reason = serializers.CharField(allow_blank=True, trim_whitespace=False)


def body(serializer: type[serializers.Serializer[None]], request: Request) -> dict[str, Any]:
    """Validated request body (camelCase already converted); 422 `validation` otherwise."""
    data = serializer(data=request.data)
    data.is_valid(raise_exception=True)
    return dict(data.validated_data)
