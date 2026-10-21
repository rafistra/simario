import datetime as dt
from typing import Any

from simario.accounts.models import User
from simario.core import clock
from simario.org.models import Position

from .models import AuditLog


def record(
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    actor: User | None = None,
    acting_as: str | None = None,
    acting_position: Position | None = None,
    before: Any = None,
    after: Any = None,
    at: dt.datetime | None = None,
) -> AuditLog:
    """Appends one audit entry; call inside the mutation's transaction."""
    return AuditLog.objects.create(
        at=at or clock.now(),
        actor=actor,
        acting_as=acting_as,
        acting_position=acting_position,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
    )
