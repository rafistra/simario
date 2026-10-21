"""Signed-in context for GET /api/v1/me (docs/03_api_contract.md §3). Holdings, permissions and
role views come from simario.domain.access over rows loaded from the ORM."""

import datetime as dt
from typing import Any

from django.conf import settings

from simario.calendar.models import Quarter
from simario.core import clock
from simario.domain import access
from simario.domain.calendar import quarter_containing
from simario.org.models import (
    MonitoringAssignment,
    Position,
    PositionDelegate,
    PositionOccupancy,
    PositionType,
    Role,
    RolePermission,
    UserRole,
)

from .models import User

# Menu order of role views (never used for permission checks, RB-ADM-002).
VIEW_ORDER = ["PMR", "PMT", "PJM", "PMD", "SAD"]


def _iso(value: dt.date | None) -> str | None:
    return value.isoformat() if value else None


def _id(value: Any) -> str | None:
    return str(value) if value is not None else None


def load_access_db() -> access.Db:
    """Every row simario.domain.access needs, as plain dicts with string ids and ISO dates."""
    return {
        "users": [
            {
                "id": str(u.id),
                "active": u.is_active,
                "org_unit_id": _id(u.org_unit_id),
                "full_name": u.full_name,
            }
            for u in User.objects.all()
        ],
        "occupancies": [
            {
                "id": str(o.id),
                "position_id": str(o.position_id),
                "user_id": str(o.user_id),
                "is_filler": o.is_filler,
                "start_date": _iso(o.start_date),
                "end_date": _iso(o.end_date),
            }
            for o in PositionOccupancy.objects.all()
        ],
        "delegates": [
            {
                "id": str(d.id),
                "position_id": str(d.position_id),
                "user_id": str(d.user_id),
                "appointed_by_occupancy_id": str(d.appointed_by_id),
                "start_date": _iso(d.start_date),
                "end_date": _iso(d.end_date),
            }
            for d in PositionDelegate.objects.all()
        ],
        "positions": [
            {
                "id": str(p.id),
                "position_type_id": str(p.position_type_id),
                "org_unit_id": str(p.org_unit_id),
            }
            for p in Position.objects.all()
        ],
        "position_types": [
            {
                "id": str(t.id),
                "line": t.line,
                "default_role_id": str(t.default_role_id),
                "allows_multiple_officials": t.allows_multiple_officials,
            }
            for t in PositionType.objects.all()
        ],
        "role_permissions": [
            {"role_id": str(rp.role_id), "permission": rp.permission_id, "scope": rp.scope}
            for rp in RolePermission.objects.all()
        ],
        "user_roles": [
            {"user_id": str(r.user_id), "role_id": str(r.role_id)} for r in UserRole.objects.all()
        ],
        "assignments": [
            {
                "id": str(a.id),
                "target_position_id": str(a.target_position_id),
                "lead_position_id": str(a.lead_position_id),
                "quarter_from_id": str(a.quarter_from_id),
                "quarter_to_id": str(a.quarter_to_id),
                "supports": [{"position_id": str(s.position_id)} for s in a.supports.all()],
            }
            for a in MonitoringAssignment.objects.prefetch_related("supports")
        ],
        "quarters": [
            {
                "id": str(q.id),
                "fiscal_year": q.fiscal_year_id,
                "number": q.number,
                "starts_on": _iso(q.starts_on),
                "ends_on": _iso(q.ends_on),
            }
            for q in Quarter.objects.all()
        ],
    }


def build_me(user: User) -> dict[str, Any]:
    db = load_access_db()
    uid = str(user.id)
    today = clock.today().isoformat()
    role_codes = {str(r.id): r.code for r in Role.objects.all()}
    positions = {str(p.id): p for p in Position.objects.select_related("org_unit", "position_type")}

    holdings = []
    for h in access.holdings_of(db, uid, today):
        position = positions[h["position_id"]]
        official = access.finalising_official(db, h["position_id"], today)
        holdings.append(
            {
                **h,
                "position": position,
                "unit_code": position.org_unit.code,
                "official_name": official["full_name"] if official else None,
                "role_view": role_codes.get(str(position.position_type.default_role_id)),
            }
        )

    held = [h["position_id"] for h in holdings]
    last = _id(user.last_position_id)
    active = last if last in held else (held[0] if held else None)

    scopes = access.permission_scopes(db, uid, today)
    views = {role_codes.get(r) for r in access.effective_role_ids(db, uid, today)}
    quarter_row = quarter_containing(db["quarters"], today)

    return {
        "user": user,
        "server_now": clock.now().isoformat(timespec="seconds"),
        "today": today,
        "dev_tools": settings.SIMARIO_DEV_TOOLS,
        "holdings": holdings,
        "active_position_id": active,
        "permissions": [{"code": c, "scope": s} for c, s in sorted(scopes.items())],
        "role_views": [v for v in VIEW_ORDER if v in views],
        "current_quarter": Quarter.objects.get(pk=quarter_row["id"]) if quarter_row else None,
    }


def holds_position(user: User, position_id: str) -> bool:
    db = load_access_db()
    return any(
        h["position_id"] == position_id
        for h in access.holdings_of(db, str(user.id), clock.today().isoformat())
    )
