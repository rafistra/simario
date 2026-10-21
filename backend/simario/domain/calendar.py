"""Calendar rules (PRD §2.5). Mirrors frontend/src/domain/calendar.ts and quarterProblems in
frontend/src/data/api/calendar.ts; shared vectors in shared/test-vectors/calendar.json. Dates are
'YYYY-MM-DD' strings, as in the frontend."""

import calendar as _cal
import datetime as dt
from collections.abc import Sequence
from typing import Any

ROMAN = ("I", "II", "III", "IV")


def _d(iso: str) -> dt.date:
    return dt.date.fromisoformat(iso[:10])


def add_days(iso: str, days: int) -> str:
    return (_d(iso) + dt.timedelta(days=days)).isoformat()


def add_workdays(iso: str, workdays: int) -> str:
    """Working days count Monday–Friday only (no holiday calendar in v1.0, §1.10)."""
    day = _d(iso)
    left = workdays
    while left > 0:
        day += dt.timedelta(days=1)
        if day.weekday() < 5:
            left -= 1
    return day.isoformat()


def _last_day(year: int, month: int) -> dt.date:
    return dt.date(year, month, _cal.monthrange(year, month)[1])


def last_friday(year: int, month: int) -> str:
    day = _last_day(year, month)
    while day.weekday() != 4:
        day -= dt.timedelta(days=1)
    return day.isoformat()


def first_friday(year: int, month: int) -> str:
    day = dt.date(year, month, 1)
    while day.weekday() != 4:
        day += dt.timedelta(days=1)
    return day.isoformat()


def default_quarters(year: int) -> list[dict[str, Any]]:
    """Default quarter rows for a new fiscal year (FR-ADM-007, §2.5 defaults)."""
    rows = []
    for n in (1, 2, 3, 4):
        first = (n - 1) * 3 + 1
        third = first + 2
        nxt = (year + 1, 1) if third == 12 else (year, third + 1)
        rows.append(
            {
                "number": n,
                "starts_on": f"{year}-{first:02d}-01",
                "ends_on": _last_day(year, third).isoformat(),
                "lini1_opens_on": f"{year}-{third:02d}-01",
                "lini1_deadline": last_friday(year, third),
                "lini3_opens_on": f"{year}-{first:02d}-01",
                "lini3_deadline": first_friday(*nxt),
                "explanation_workdays": 5,
            }
        )
    return rows


def lateness_at(at: str, deadline: str, tolerance_days: int) -> str | None:
    """Lateness marker fixed at the moment of finalising (§2.5); `at` is local (WITA) ISO."""
    day = at[:10]
    if day <= deadline:
        return None
    if day <= add_days(deadline, tolerance_days):
        return "terlambat"
    return "sangat_terlambat"


def quarter_problems(year: int, quarters: Sequence[dict[str, Any]]) -> list[dict[str, str]]:
    """INV-9 per quarter and across the year; readable problems keyed by (camelCase) field."""
    out: list[dict[str, str]] = []
    ordered = sorted(quarters, key=lambda q: q["number"])
    for i, q in enumerate(ordered):
        tw = f"TW {ROMAN[q['number'] - 1]}"

        def add(field: str, message: str, q: dict[str, Any] = q, tw: str = tw) -> None:
            out.append({"quarter_id": q["id"], "field": field, "message": f"{tw}: {message}"})

        if q["starts_on"] > q["ends_on"]:
            add("endsOn", "tanggal akhir sebelum tanggal mulai.")
        if not q["starts_on"].startswith(str(year)) or not q["ends_on"].startswith(str(year)):
            add("startsOn", f"triwulan harus berada di tahun {year}.")
        if i > 0 and add_days(ordered[i - 1]["ends_on"], 1) != q["starts_on"]:
            add("startsOn", "triwulan harus bersambung dengan triwulan sebelumnya.")
        if q["lini1_opens_on"] > q["lini1_deadline"]:
            add("lini1Deadline", "tenggat Lini 1 sebelum jendela Lini 1 dibuka.")
        if q["lini1_deadline"] >= q["lini3_deadline"]:
            add("lini3Deadline", "tenggat Lini 3 harus sesudah tenggat Lini 1.")
        if q["lini3_opens_on"] > q["lini3_deadline"]:
            add("lini3Deadline", "tenggat Lini 3 sebelum jendela Lini 3 dibuka.")
        if not (q["explanation_workdays"] >= 1):
            add("explanationWorkdays", "hari kerja penjelasan minimal 1.")
    if ordered and ordered[0]["starts_on"] != f"{year}-01-01":
        out.append(
            {
                "quarter_id": ordered[0]["id"],
                "field": "startsOn",
                "message": "TW I dimulai 1 Januari.",
            }
        )
    if ordered and ordered[-1]["ends_on"] != f"{year}-12-31":
        out.append(
            {
                "quarter_id": ordered[-1]["id"],
                "field": "endsOn",
                "message": "TW IV berakhir 31 Desember.",
            }
        )
    return out


def quarter_containing(quarters: Sequence[dict[str, Any]], day: str) -> dict[str, Any] | None:
    """The quarter (of any fiscal year present) whose range contains `day` (YYYY-MM-DD)."""
    return next((q for q in quarters if q["starts_on"] <= day <= q["ends_on"]), None)
