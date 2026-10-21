"""Position workspace header (PRD §1.8.1). Replaces the frontend's read of the local store in
layout/Workspace.tsx: the server decides 404 (unknown or not Lini 1) and 403 (outside the read
scope for the viewed fiscal year), and returns the header data."""

import datetime as dt
from typing import Any

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.calendar.models import FiscalYear
from simario.core import clock
from simario.core.errors import ApiError
from simario.domain import access
from simario.registers.models import Register

from .models import OrgUnit, Position, PositionDelegate
from .serializers import PositionSerializer

Row = dict[str, Any]


def _active(start: dt.date, end: dt.date | None, today: dt.date) -> bool:
    return start <= today and (end is None or end >= today)


def workspace(user: User, position_id: Any, fiscal_year: int | None) -> Row:
    position = Position.objects.select_related("position_type").filter(pk=position_id).first()
    if position is None or position.position_type.line != 1:
        raise ApiError("not_found", "Jabatan tidak ditemukan.")
    today = clock.today()
    current = clock.now().year
    year = fiscal_year or current
    db = load_access_db()
    if not access.can_read_position(db, str(user.id), str(position.id), today.isoformat(), year):
        raise ApiError("forbidden", "Anda tidak memiliki akses ke jabatan ini.")
    unit = OrgUnit.objects.get(pk=position.org_unit_id)
    years = sorted(
        {
            *Register.objects.filter(position=position).values_list("fiscal_year_id", flat=True),
            current,
        },
        reverse=True,
    )
    archived = set(
        FiscalYear.objects.filter(year__in=years, status="archived").values_list("year", flat=True)
    )
    officials = access.officials_of(db, str(position.id), today.isoformat())
    operators = [
        d.user.full_name
        for d in PositionDelegate.objects.select_related("user").filter(position=position)
        if _active(d.start_date, d.end_date, today)
    ]
    return {
        "position": dict(PositionSerializer(position).data),
        "unit": {"id": str(unit.id), "code": unit.code, "name": unit.name},
        "years": [{"year": y, "archived": y in archived} for y in years],
        "officials": [
            {"name": o["user"]["full_name"], "is_filler": o["occupancy"]["is_filler"]}
            for o in officials
        ],
        "operators": operators,
    }
