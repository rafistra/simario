import datetime as dt

from simario.accounts.models import User
from simario.core import clock

from .models import Notification


def notify(
    *,
    user: User,
    kind: str,
    text: str,
    target_url: str,
    event_key: str,
    at: dt.datetime | None = None,
) -> Notification | None:
    """Creates the notification once per (user, event_key); returns None when it already exists."""
    notification, created = Notification.objects.get_or_create(
        user=user,
        event_key=event_key,
        defaults={
            "kind": kind,
            "text": text,
            "target_url": target_url,
            "created_at": at or clock.now(),
        },
    )
    return notification if created else None
