from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class Notification(UUIDModel):
    """FR-NTF. `event_key` makes every event notify a user at most once."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=40)
    text = models.TextField()
    target_url = models.CharField(max_length=500)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_index=True)
    event_key = models.CharField(max_length=200)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "event_key"], name="uniq_notification_event")
        ]
