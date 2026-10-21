"""Deadline reminders — FR-NTF-005, 006, 009 (H-1), 012. Ports
frontend/src/data/local/reminders.ts as the scheduled task `reminders`. Idempotent per event key;
a moment older than a few days is not raised retroactively (e.g. when the clock jumps far
ahead)."""

import datetime as dt
from typing import Any

from django.db import transaction

from simario.core import scheduler
from simario.core.format import format_date
from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.domain.calendar import add_days
from simario.domain.index import by

from .comparisons import _iso, _send, holders_of
from .selectors import assessment_db

Row = dict[str, Any]
RECENT_DAYS = 3


def _moments(opens_on: str, deadline: str) -> list[tuple[str, str]]:
    """Reminder moments: window opening, H-7 and H-1 before the deadline."""
    return [("buka", opens_on), ("h7", add_days(deadline, -7)), ("h1", add_days(deadline, -1))]


def _fmt(day: str) -> str:
    return format_date(dt.date.fromisoformat(day))


@scheduler.register("reminders")
@transaction.atomic
def run_reminders(as_of: dt.datetime) -> None:
    at = _iso(as_of)
    today = at[:10]

    def due(day: str) -> bool:
        return day <= today and (
            dt.date.fromisoformat(today) - dt.date.fromisoformat(day)
        ).days <= (RECENT_DAYS)

    db = assessment_db()
    open_years = {f["year"] for f in db["fiscal_years"] if f["status"] != "archived"}
    lini1_types = {t["id"] for t in db["position_types"] if t["line"] == 1}
    lini1 = [p for p in db["positions"] if p["active"] and p["position_type_id"] in lini1_types]

    def l1_done(rq_id: str) -> bool:
        a = next(
            (
                x
                for x in by(db, "assessments", "risk_quarter_id").get((rq_id,), [])
                if x["risk_quarter_id"] == rq_id and x["assessor_line"] == 1
            ),
            None,
        )
        return bool(a and a["status"] in ("final", "not_assessed"))

    for q in (x for x in db["quarters"] if x["fiscal_year"] in open_years):
        # FR-NTF-005 — Lini 1 holders of each position, while unfinalised risks remain.
        for key, day in _moments(q["lini1_opens_on"], q["lini1_deadline"]):
            if not due(day) or today > q["lini1_deadline"]:
                continue
            for p in lini1:
                items = rules.quarter_risks(db, p["id"], q)
                if not items:
                    continue
                done = len([1 for _, rq in items if l1_done(rq["id"])])
                if done == len(items):
                    continue
                _send(
                    holders_of(db, [p["id"]], today),
                    kind="deadline",
                    text=f"Penilaian {rules.tw_label(q)} {p['name']}: tenggat "
                    f"{_fmt(q['lini1_deadline'])}, {done} dari {len(items)} risiko sudah dinilai",
                    target_url=f"/jabatan/{p['id']}/penilaian/{q['fiscal_year']}/{q['number']}",
                    event_key=f"ntf5:{p['id']}:{q['id']}:{key}",
                    at=as_of,
                )
        # FR-NTF-006 — Lini 3 holders of each expected directorate.
        for key, day in _moments(q["lini3_opens_on"], q["lini3_deadline"]):
            if not due(day) or today > q["lini3_deadline"]:
                continue
            all_rqs = [rq for p in lini1 for _, rq in rules.quarter_risks(db, p["id"], q)]
            if not all_rqs:
                continue
            for d in board_rules.expected_lini3(db, q["id"]):
                done = len(
                    [
                        rq
                        for rq in all_rqs
                        if any(
                            a["risk_quarter_id"] == rq["id"]
                            and a["assessor_position_id"] == d
                            and a["status"] == "final"
                            for a in by(db, "assessments", "risk_quarter_id").get((rq["id"],), [])
                        )
                    ]
                )
                if done == len(all_rqs):
                    continue
                _send(
                    holders_of(db, [d], today),
                    kind="deadline",
                    text=f"Penilaian Lini 3 {rules.tw_label(q)}: {done} dari {len(all_rqs)} risiko "
                    "sudah dinilai",
                    target_url="/penilaian",
                    event_key=f"ntf6:{d}:{q['id']}:{key}",
                    at=as_of,
                )

    # FR-NTF-009 — H-1 before a mandatory explanation's deadline when not sent.
    rqs = {x["id"]: x for x in db["risk_quarters"]}
    risks = {x["id"]: x for x in db["risks"]}
    registers = {x["id"]: x for x in db["registers"]}
    groups: dict[tuple[str, str], Row] = {}
    for r in db["results"]:
        dueon = r["explanation_due_on"]
        if (
            not r["explanation_required"]
            or r["explanation_status"] in ("sent", "not_sent")
            or not dueon
            or r["opened_at"][:16] > at[:16]
        ):
            continue
        if not due(add_days(dueon, -1)) or today > dueon:
            continue
        rq = rqs[r["risk_quarter_id"]]
        reg = registers[risks[rq["register_risk_id"]]["register_id"]]
        if reg["fiscal_year"] not in open_years:
            continue
        g = groups.setdefault(
            (reg["position_id"], dueon),
            {"quarter_id": rq["quarter_id"], "risks": set()},
        )
        g["risks"].add(rq["id"])
    for (position_id, dueon), g in groups.items():
        q = next(x for x in db["quarters"] if x["id"] == g["quarter_id"])
        _send(
            holders_of(db, [position_id], today),
            kind="explanation_required",
            text=f"{len(g['risks'])} risiko memerlukan penjelasan paling lambat {_fmt(dueon)}",
            target_url=f"/jabatan/{position_id}/penilaian/{q['fiscal_year']}/{q['number']}",
            event_key=f"ntf9h1:{position_id}:{dueon}",
            at=as_of,
        )

    # FR-NTF-012 — 14 days before the projected archive date (hard limit, §2.5).
    for fy in (f for f in db["fiscal_years"] if f["status"] != "archived"):
        tw4 = next(
            (q for q in db["quarters"] if q["fiscal_year"] == fy["year"] and q["number"] == 4),
            None,
        )
        if tw4 is None:
            continue
        projected = add_days(tw4["lini3_deadline"], fy["tolerance_days"] + fy["archive_grace_days"])
        if not due(add_days(projected, -14)) or today > projected:
            continue
        for p in lini1:
            _send(
                holders_of(db, [p["id"]], today),
                kind="archive",
                text=f"Utas TA {fy['year']} akan diarsipkan sekitar {_fmt(projected)}",
                target_url=f"/jabatan/{p['id']}/papan/{fy['year']}",
                event_key=f"ntf12:{fy['year']}:{p['id']}",
                at=as_of,
            )
