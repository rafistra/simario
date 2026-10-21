from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer[Notification]):
    """Shape of `Notification` in frontend/src/domain/types.ts."""

    user_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "user_id",
            "kind",
            "text",
            "target_url",
            "read_at",
            "created_at",
            "event_key",
        ]
