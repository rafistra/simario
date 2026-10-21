"""Risk history — PRD ch. 8 (FR-RWY-001 … 006). Ports buildHistory in
frontend/src/data/api/history.ts: VIS-1/2/7/9 are applied here."""

import uuid
from typing import Any

from simario.accounts.models import User
from simario.board.selectors import now_iso
from simario.domain import board as board_rules
from simario.domain import register as register_rules
from simario.domain import sheets
from simario.domain import visibility as vis
from simario.domain.index import by
from simario.registers.selectors import assert_can_read

from .selectors import Db, assessment_db, shown_result, to_display

Row = dict[str, Any]
RISK_TYPES = ("kinerja_anggaran", "ketidakpatuhan", "kecurangan")


def _find(items: list[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _cell(db: Db, viewer: Row, risk: Row, position_id: str, quarter: Row, at: str) -> Row:
    base: Row = {
        "quarter": quarter,
        "chips": [],
        "summary": None,
        "recurring": False,
        "risk_id": risk["id"],
        "position_id": position_id,
    }
    rq = next(
        (
            x
            for x in db["risk_quarters"]
            if x["register_risk_id"] == risk["id"] and x["quarter_id"] == quarter["id"]
        ),
        None,
    )
    if rq is None or not register_rules.assessed_in_quarter(db, risk, quarter):
        return {**base, "state": "none"}
    expected = board_rules.expected_lini3(db, quarter["id"])
    opened = board_rules.opened_results(db, rq["id"], at)
    opened_set = {r["lini3_position_id"] for r in opened}
    late = not viewer["blind_view_granted"] and vis.is_late_directorate(
        viewer, opened_set, expected
    )
    if not opened or late:
        return {**base, "state": "waiting"}
    lini1_holder = position_id in viewer["held_position_ids"]

    def pos(pid: str) -> Row:
        return _find(db["positions"], "id", pid) or {}

    def assess(pid: str) -> Row | None:
        return next(
            (
                a
                for a in by(db, "assessments", "risk_quarter_id").get((rq["id"],), [])
                if a["risk_quarter_id"] == rq["id"] and a["assessor_position_id"] == pid
            ),
            None,
        )

    l1 = assess(position_id)
    if l1 is None or l1["status"] == "not_assessed":
        l1_kind = "tidak_dinilai"
    elif l1["not_relevant"]:
        l1_kind = "belum_relevan"
    else:
        l1_kind = "score"
    chips: list[Row] = [
        {
            "position_id": position_id,
            "label": "L1",
            "line": 1,
            "kind": l1_kind,
            "assessment": to_display(db, l1) if l1 else None,
            "result": None,
            "name": pos(position_id).get("name", ""),
        }
    ]
    for p in expected:
        r = next((x for x in opened if x["lini3_position_id"] == p), None)
        a = assess(p) if r else None
        if r is None:
            kind = "menunggu"
        elif a is not None and a["status"] == "not_assessed":
            kind = "tidak_dinilai"
        else:
            kind = "score"
        chips.append(
            {
                "position_id": p,
                "label": pos(p).get("short_name") or pos(p).get("code") or "",
                "line": 3,
                "kind": kind,
                "assessment": to_display(db, a) if a else None,
                "result": shown_result(r, lini1_holder) if r else None,
                "name": pos(p).get("name", ""),
            }
        )
    if any(r["result"] == "tidak_sesuai" for r in opened):
        summary = "tidak_sesuai"
    elif len(opened) < len(expected):
        summary = "partial"
    elif all(r["result"] == "incomparable" for r in opened):
        summary = "incomparable"
    else:
        summary = "sesuai"
    return {
        **base,
        "state": "open",
        "chips": chips,
        "summary": summary,
        "recurring": rq["recurring"],
    }


def _published_item(r: Row) -> bool:
    return r["status"] in ("active", "inactive")


def build_history(user: User, position_id: uuid.UUID, fiscal_year: int) -> Row:
    pid = str(position_id)
    assert_can_read(user, pid, fiscal_year)
    at = now_iso()
    db = assessment_db([position_id])
    viewer = vis.viewer_for(db, str(user.id), at[:10])
    quarters = sorted(
        (q for q in db["quarters"] if q["fiscal_year"] == fiscal_year), key=lambda q: q["number"]
    )
    registers = [r for r in db["registers"] if r["position_id"] == pid]
    years = sorted({r["fiscal_year"] for r in registers}, reverse=True)
    reg = next((r for r in registers if r["fiscal_year"] == fiscal_year), None)
    published = bool(
        reg and (reg["status"] in ("published", "archived") or reg.get("published_at"))
    )
    mutu = [sheets.lembar_mutu(db, viewer, pid, q, at) for q in quarters]
    if reg is None or not published:
        return {
            "fiscal_year": fiscal_year,
            "years": years,
            "quarters": quarters,
            "mutu": mutu,
            "rows": [],
            "stages": [],
            "published": False,
        }

    all_stages = register_rules.register_stages(db, reg)
    active = [s for s in all_stages if s["active"]]
    rows: list[Row] = []
    for risk in db["risks"]:
        if risk["register_id"] != reg["id"] or not _published_item(risk):
            continue
        cells = [_cell(db, viewer, risk, pid, q, at) for q in quarters]
        other_years = []
        for r in registers:
            if r["fiscal_year"] == fiscal_year:
                continue
            other = next(
                (
                    x
                    for x in db["risks"]
                    if x["register_id"] == r["id"]
                    and x["lineage_id"] == risk["lineage_id"]
                    and _published_item(x)
                ),
                None,
            )
            if other is None:
                continue
            qs = sorted(
                (q for q in db["quarters"] if q["fiscal_year"] == r["fiscal_year"]),
                key=lambda q: q["number"],
            )
            other_years.append(
                {
                    "fiscal_year": r["fiscal_year"],
                    "risk": other,
                    "cells": [_cell(db, viewer, other, pid, q, at) for q in qs],
                }
            )
        other_years.sort(key=lambda x: -x["fiscal_year"])
        stage = _find(db["stages"], "id", risk["stage_id"])
        assert stage is not None
        inactive = None
        if risk["status"] == "inactive":
            q = _find(db["quarters"], "id", risk.get("deactivated_from_quarter_id"))
            inactive = register_rules.inactive_label(q, reg["fiscal_year"])
        rows.append(
            {
                "risk": risk,
                "stage": stage,
                "stage_index": (active.index(stage) + 1) if stage in active else 0,
                "risk_type": risk["risk_type"],
                "inactive_label": inactive,
                "recurring": any(c["recurring"] for c in cells),
                "tidak_sesuai": any(c["summary"] == "tidak_sesuai" for c in cells),
                "cells": cells,
                "other_years": other_years,
            }
        )

    def stage_order(s: Row) -> int:
        return all_stages.index(s) if s in all_stages else len(all_stages)

    rows.sort(
        key=lambda r: (
            stage_order(r["stage"]),
            RISK_TYPES.index(r["risk_type"]),
            int(r["risk"]["status"] == "inactive"),
            r["risk"]["order"],
        )
    )
    return {
        "fiscal_year": fiscal_year,
        "years": years,
        "quarters": quarters,
        "mutu": mutu,
        "rows": rows,
        "stages": [
            {
                "id": s["id"],
                "label": f"Tahap {active.index(s) + 1} · {s['name']}" if s["active"] else s["name"],
            }
            for s in all_stages
            if any(r["stage"]["id"] == s["id"] for r in rows)
        ],
        "published": True,
    }
