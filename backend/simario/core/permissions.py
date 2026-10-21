"""Capability checks for configuration services (FR-ADM-002). Codes 1–26 only, never role names
(RB-ADM-002). Mirrors requireActor in frontend/src/data/local/actor.ts."""

import datetime as dt
from dataclasses import dataclass

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.domain import access

from . import clock
from .errors import ApiError


@dataclass(frozen=True)
class Actor:
    user: User
    at: dt.datetime
    today: str
    # Audit label: configuration actors are recorded as superadmin when they can manage roles.
    acting_as: str


def has_permission(user: User, code: int) -> bool:
    return access.has_permission(load_access_db(), str(user.id), code, clock.today().isoformat())


def require_permission(user: User, *codes: int) -> Actor:
    """The actor, when they hold at least one of `codes`; otherwise `forbidden`."""
    db = load_access_db()
    today = clock.today().isoformat()
    scopes = access.permission_scopes(db, str(user.id), today)
    if codes and not any(c in scopes for c in codes):
        raise ApiError("forbidden", "Anda tidak memiliki akses untuk tindakan ini.")
    return Actor(
        user=user,
        at=clock.now(),
        today=today,
        acting_as="superadmin" if 22 in scopes else "pengelola",
    )
