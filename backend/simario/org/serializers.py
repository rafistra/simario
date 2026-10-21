from typing import Any

from rest_framework import serializers

from .models import Position


class PositionSerializer(serializers.ModelSerializer[Position]):
    """Shape of `Position` in frontend/src/domain/types.ts."""

    org_unit_id = serializers.UUIDField(read_only=True)
    position_type_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Position
        fields = [
            "id",
            "code",
            "name",
            "org_unit_id",
            "position_type_id",
            "identity",
            "active",
            "deactivated_at",
            "deactivation_reason",
            "short_name",
        ]


def position_data(position: Position) -> dict[str, Any]:
    data: dict[str, Any] = PositionSerializer(position).data
    return data
