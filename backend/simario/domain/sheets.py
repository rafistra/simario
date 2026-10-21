"""Derived quarter summaries — FR-LBR-004 (Lembar Mutu), FR-RWY-001, FR-BRD-004. Mirrors
frontend/src/domain/rules/sheets.ts; shared vectors in shared/test-vectors/sheets.json. Neutral
to the reader except VIS-9: a late directorate's viewer gets nothing about risks it is still
blind on."""

import math
from typing import Any

from .access import Db
from .assessment import predicate_in, quarter_risks
from .board import expected_lini3, opened_results
from .visibility import is_late_directorate

Row = dict[str, Any]
RISK_TYPES = ("kinerja_anggaran", "ketidakpatuhan", "kecurangan")


def _round1(n: float) -> float:
    """Math.round(n * 10) / 10 (half up), not Python's banker's rounding."""
    return math.floor(n * 10 + 0.5) / 10


def lembar_mutu(db: Db, viewer: Row, position_id: str, quarter: Row, at: str) -> Row:
    expected = expected_lini3(db, quarter["id"])
    assessors: list[Row] = [{"position_id": position_id, "label": "L1", "line": 1}]
    for p in expected:
        pos = next((x for x in db["positions"] if x["id"] == p), None)
        label = (pos or {}).get("short_name") or (pos or {}).get("code") or ""
        assessors.append({"position_id": p, "label": label, "line": 3})
    items: list[Row] = []
    for risk, rq in quarter_risks(db, position_id, quarter):
        opened = opened_results(db, rq["id"], at)
        late = not viewer["blind_view_granted"] and is_late_directorate(
            viewer, {r["lini3_position_id"] for r in opened}, expected
        )
        if not late:
            items.append({"risk": risk, "rq": rq, "opened": opened})

    rows: list[Row] = []
    for risk_type in RISK_TYPES:
        of_type = [x for x in items if x["risk"]["risk_type"] == risk_type]
        cells: list[Row] = []
        for a_ in assessors:
            relevant = [
                x
                for x in of_type
                if (
                    len(x["opened"]) > 0
                    if a_["line"] == 1
                    else any(r["lini3_position_id"] == a_["position_id"] for r in x["opened"])
                )
            ]
            scores: list[float] = []
            for x in relevant:
                a = next(
                    (
                        y
                        for y in db["assessments"]
                        if y["risk_quarter_id"] == x["rq"]["id"]
                        and y["assessor_position_id"] == a_["position_id"]
                    ),
                    None,
                )
                if (
                    a
                    and a["status"] == "final"
                    and not a["not_relevant"]
                    and a["score"] is not None
                ):
                    scores.append(float(a["score"]))
            average = _round1(sum(scores) / len(scores)) if scores else None
            cells.append(
                {
                    "predicate": None if average is None else predicate_in(db, quarter, average),
                    "count": len(scores),
                    "opened": len(relevant) > 0,
                }
            )
        rows.append({"risk_type": risk_type, "cells": cells})

    results = [r for x in items for r in x["opened"]]

    def l1_status(rq_id: str) -> str | None:
        a = next(
            (
                y
                for y in db["assessments"]
                if y["risk_quarter_id"] == rq_id and y["assessor_line"] == 1
            ),
            None,
        )
        return a["status"] if a else None

    return {
        "quarter": quarter,
        "assessors": assessors,
        "rows": rows,
        "sesuai": len([r for r in results if r["result"] == "sesuai"]),
        "tidak_sesuai": len([r for r in results if r["result"] == "tidak_sesuai"]),
        "berulang": len([x for x in items if x["opened"] and x["rq"]["recurring"]]),
        "not_assessed_l1": [
            x["risk"] for x in items if x["opened"] and l1_status(x["rq"]["id"]) == "not_assessed"
        ],
        "any_opened": len(results) > 0,
    }


def latest_opened_quarter(db: Db, position_id: str, at: str) -> Row | None:
    """The most recent quarter of a position in which at least one result has opened
    (FR-BRD-004)."""
    qs = sorted(db["quarters"], key=lambda q: (-q["fiscal_year"], -q["number"]))
    for q in qs:
        if any(opened_results(db, rq["id"], at) for _, rq in quarter_risks(db, position_id, q)):
            return q
    return None
