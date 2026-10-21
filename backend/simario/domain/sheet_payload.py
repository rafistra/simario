"""Lembar Komunikasi and Lembar Mutu payloads — PRD ch. 9 (FR-LBR-001 … 010). Mirrors
frontend/src/domain/rules/sheetPayload.ts; shared vectors in shared/test-vectors/sheet-payload.json.
Built from a viewer-neutral view (VIS-7): an assessor's values appear only once that assessor's
result for the risk has opened. Payloads keep per-risk values so a late directorate can be masked
per reader (FR-LBR-010, VIS-9) and totals recomputed without masked risks."""

import math
from collections.abc import Sequence
from typing import Any

from .access import Db
from .assessment import band_version_for, option_label_of, quarter_risks
from .board import expected_lini3
from .calendar import add_days
from .register import assessed_in_quarter
from .score_bands import predicate_for

Row = dict[str, Any]
ROMAN = ("I", "II", "III", "IV")
RISK_TYPES = ("kinerja_anggaran", "ketidakpatuhan", "kecurangan")
SECTIONS = ("A", "B", "C")


def _t(s: str | None) -> str:
    """Comparable local time: the first 16 characters of an ISO string."""
    return (s or "")[:16]


def _find(items: Sequence[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _active_occupant(db: Db, position_id: str, today: str) -> str:
    o = next(
        (
            x
            for x in db["occupancies"]
            if x["position_id"] == position_id
            and x["is_filler"]
            and x["start_date"] <= today
            and (not x["end_date"] or x["end_date"] >= today)
        ),
        None,
    )
    u = _find(db["users"], "id", o["user_id"]) if o else None
    return str(u["full_name"]) if u else ""


def _is_image(a: Row) -> bool:
    return str(a["mime_type"]).startswith("image/")


def _sheet_comment(db: Db, c: Row, at: str) -> Row:
    files = [
        a
        for a in db["attachments"]
        if a["owner_kind"] == "comment"
        and a["owner_id"] == c["id"]
        and a["scan_status"] == "clean"
        and _t(a["uploaded_at"]) <= _t(at)
    ]
    user = _find(db["users"], "id", c["author_user_id"])
    pos = _find(db["positions"], "id", c["acting_position_id"])
    pos_name = pos["name"] if pos else ""
    return {
        "id": c["id"],
        "author": user["full_name"] if user else "",
        "role": f"Operator {pos_name}" if c["acting_as"] == "operator" else pos_name,
        "at": c["created_at"],
        "body": c["body"],
        "is_step": c["is_step"],
        "files": [f["filename"] for f in files if not f["is_confidential"] and not _is_image(f)],
        "confidential": len([f for f in files if f["is_confidential"]]),
        "images": [
            {"id": f["id"], "name": f["filename"]}
            for f in files
            if not f["is_confidential"] and _is_image(f)
        ],
    }


def _q_key(q: Row) -> int:
    return int(q["fiscal_year"]) * 10 + int(q["number"])


def _lini2_lead(db: Db, position_id: str, quarter: Row, today: str) -> Row:
    """Lini 2 holder shown in the signature block: the lead position assigned for the quarter."""
    a = None
    for x in db["assignments"]:
        if x["target_position_id"] != position_id:
            continue
        f = _find(db["quarters"], "id", x["quarter_from_id"])
        t = _find(db["quarters"], "id", x["quarter_to_id"])
        if f and t and _q_key(f) <= _q_key(quarter) <= _q_key(t):
            a = x
            break
    if a is None:
        return {"unit": "", "name": ""}
    lead = _find(db["positions"], "id", a["lead_position_id"])
    return {
        "unit": lead["name"] if lead else "",
        "name": _active_occupant(db, a["lead_position_id"], today),
    }


def _has_langkah_at(db: Db, risk_id: str, quarter_id: str, at: str) -> bool:
    return any(
        c["register_risk_id"] == risk_id
        and c["quarter_id"] == quarter_id
        and c["is_step"]
        and c["author_line"] == 1
        and not c["withdrawn_at"]
        and _t(c["created_at"]) <= _t(at)
        for c in db["comments"]
    )


def _lini3_signatories(db: Db) -> list[Row]:
    """The Lini 3 directorates, in position order (the prototype names Kepatuhan and PAI)."""
    types = {t["id"] for t in db["position_types"] if t["line"] == 3}
    return [p for p in db["positions"] if p["position_type_id"] in types and p["active"]]


def build_sheet_payload(
    db: Db,
    position_id: str,
    quarter: Row,
    at: str,
    photo_selection: dict[str, list[str]] | None = None,
) -> Row:
    today = at[:10]
    position = _find(db["positions"], "id", position_id)
    assert position is not None
    unit = _find(db["org_units"], "id", position["org_unit_id"])
    assert unit is not None
    register = next(
        (
            r
            for r in db["registers"]
            if r["position_id"] == position_id and r["fiscal_year"] == quarter["fiscal_year"]
        ),
        None,
    )
    official = _active_occupant(db, position_id, today)
    expected = expected_lini3(db, quarter["id"])
    band_version = band_version_for(db, quarter)
    bands = [b for b in db["score_bands"] if b["version_id"] == band_version]

    def pos(pid: str) -> Row:
        return _find(db["positions"], "id", pid) or {}

    risks: list[Row] = []
    for risk, rq in quarter_risks(db, position_id, quarter):
        if not assessed_in_quarter(db, risk, quarter):
            continue
        opened = [
            r
            for r in db["results"]
            if r["risk_quarter_id"] == rq["id"] and _t(r["opened_at"]) <= _t(at)
        ]
        comments = sorted(
            (
                c
                for c in db["comments"]
                if c["register_risk_id"] == risk["id"]
                and c["quarter_id"] == quarter["id"]
                and not c["withdrawn_at"]
                and _t(c["created_at"]) <= _t(at)
            ),
            key=lambda c: _t(c["created_at"]),
        )
        views = [(c, _sheet_comment(db, c, at)) for c in comments]

        def assess(pid: str, rq_id: str = rq["id"]) -> Row | None:
            return next(
                (
                    x
                    for x in db["assessments"]
                    if x["risk_quarter_id"] == rq_id and x["assessor_position_id"] == pid
                ),
                None,
            )

        l1a = assess(position_id)
        any_open = len(opened) > 0
        l1_final = any_open and l1a is not None and l1a["status"] == "final"
        l1 = {
            "position_id": position_id,
            "label": "L1",
            "name": position["name"],
            "opened": any_open,
            "score": l1a["score"] if l1_final and l1a else None,
            "option_label": option_label_of(db, band_version, l1a["score"])
            if l1_final and l1a
            else None,
            "predicate": l1a["predicate"] if l1_final and l1a else None,
            "not_relevant": any_open and bool(l1a and l1a["not_relevant"]),
            "not_relevant_reason": (l1a or {}).get("not_relevant_reason") if any_open else None,
            "not_assessed": any_open and (l1a is None or l1a["status"] == "not_assessed"),
            "note": None,
            "result": None,
        }
        lini3 = []
        for p in expected:
            r = next((x for x in opened if x["lini3_position_id"] == p), None)
            x = assess(p) if r else None
            final = x is not None and x["status"] == "final"
            lini3.append(
                {
                    "position_id": p,
                    "label": pos(p).get("short_name") or pos(p).get("code") or "",
                    "name": pos(p).get("name", ""),
                    "opened": r is not None,
                    "score": x["score"] if final and x else None,
                    "option_label": option_label_of(db, band_version, x["score"])
                    if final and x
                    else None,
                    "predicate": x["predicate"] if final and x else None,
                    "not_relevant": False,
                    "not_relevant_reason": None,
                    "not_assessed": r is not None
                    and x is not None
                    and x["status"] == "not_assessed",
                    "note": (x or {}).get("note"),
                    "result": r["result"] if r else None,
                }
            )
        sent = [
            r
            for r in opened
            if r["explanation_status"] == "sent"
            and r["explanation_sent_at"]
            and _t(r["explanation_sent_at"]) <= _t(at)
        ]
        stage = _find(db["stages"], "id", risk["stage_id"])
        risks.append(
            {
                "risk_id": risk["id"],
                "description": risk["description_snapshot"],
                "stage": stage["name"] if stage else "",
                "risk_type": risk["risk_type"],
                "quiet": not _has_langkah_at(db, risk["id"], quarter["id"], at),
                "recurring": any_open and rq["recurring"],
                "steps": [v for c, v in views if c["author_line"] == 1 and c["is_step"]],
                "lini1_other": [v for c, v in views if c["author_line"] == 1 and not c["is_step"]],
                "lini2": [v for c, v in views if c["author_line"] == 2],
                "lini3_comments": [v for c, v in views if c["author_line"] == 3],
                "l1": l1,
                "lini3": lini3,
                "explanations": [
                    {
                        "directorate": pos(r["lini3_position_id"]).get("name", ""),
                        "reason": r["explanation_reason"] or "",
                        "plan": r["explanation_plan"] or "",
                        "sent_at": r["explanation_sent_at"],
                        "sent_by": (
                            _find(db["users"], "id", r["explanation_sent_by_user_id"]) or {}
                        ).get("full_name", ""),
                        "late": bool(r["explanation_lateness"]),
                    }
                    for r in sent
                ],
                "pending_explanations": len(
                    [
                        r
                        for r in opened
                        if r["explanation_required"] and r["explanation_status"] != "sent"
                    ]
                ),
            }
        )

    def section_images(sec: str) -> list[Row]:
        """FR-LBR-005: up to 5 images per section; default the 5 most recent."""
        keys = {"A": ("steps", "lini1_other"), "B": ("lini2",), "C": ("lini3_comments",)}[sec]
        all_ = [
            {**i, "at": c["at"]} for r in risks for k in keys for c in r[k] for i in c["images"]
        ]
        chosen = (photo_selection or {}).get(sec)
        if chosen is not None:
            picked = [next((i for i in all_ if i["id"] == cid), None) for cid in chosen]
            out = [i for i in picked if i is not None][:5]
        else:
            out = sorted(all_, key=lambda i: _t(i["at"]), reverse=True)[:5]
        return [{"id": i["id"], "name": i["name"]} for i in out]

    lead = _lini2_lead(db, position_id, quarter, today)
    data_umum = (register or {}).get("data_umum") or {}
    return {
        "position_id": position_id,
        "quarter_id": quarter["id"],
        "fiscal_year": quarter["fiscal_year"],
        "quarter_number": quarter["number"],
        "built_at": at,
        "identity": {
            "unit_name": unit["name"],
            "unit_code": unit["code"],
            "position_name": position["name"],
            "position_code": position["code"],
            "official_name": official,
            "period": f"TW {ROMAN[quarter['number'] - 1]} · {quarter['starts_on']} – "
            f"{quarter['ends_on']}",
            "tujuan": data_umum.get("tujuan") or "",
            "besar_anggaran": data_umum.get("besar_anggaran"),
        },
        "assessors": [
            {"position_id": position_id, "label": "L1", "name": position["name"], "line": 1},
            *(
                {
                    "position_id": p,
                    "label": pos(p).get("short_name") or "",
                    "name": pos(p).get("name", ""),
                    "line": 3,
                }
                for p in expected
            ),
        ],
        "bands": bands,
        "risks": risks,
        "photos": {s: section_images(s) for s in SECTIONS},
        "signatures": [
            {"title": "Pejabat Lini 1", "unit": position["name"], "name": official},
            {
                "title": "Penanggung Jawab Pemantauan",
                "unit": lead["unit"] or "Lini 2",
                "name": lead["name"],
            },
            *(
                {
                    "title": p["name"],
                    "unit": "Lini 3",
                    "name": _active_occupant(db, p["id"], today),
                }
                for p in _lini3_signatories(db)
            ),
        ],
    }


def _masked(v: Row) -> Row:
    return {
        **v,
        "opened": False,
        "score": None,
        "option_label": None,
        "predicate": None,
        "not_relevant": False,
        "not_relevant_reason": None,
        "not_assessed": False,
        "note": None,
        "result": None,
    }


def mask_payload_for(payload: Row, lini3_position_ids: list[str]) -> tuple[Row, list[str]]:
    """FR-LBR-010 / VIS-9: for a Lini 3 reader whose own result for a risk has not opened, every
    other assessment, result, explanation and the Berulang marker of that risk show "Menunggu".
    Comments and the quiet marker are not masked."""
    mine = [
        a["position_id"]
        for a in payload["assessors"]
        if a["line"] == 3 and a["position_id"] in lini3_position_ids
    ]
    if not mine:
        return payload, []
    masked: list[str] = []
    risks = []
    for r in payload["risks"]:
        late = any(
            not (next((x for x in r["lini3"] if x["position_id"] == p), None) or {}).get("opened")
            for p in mine
        )
        if not late:
            risks.append(r)
            continue
        masked.append(r["risk_id"])
        risks.append(
            {
                **r,
                "recurring": False,
                "l1": _masked(r["l1"]),
                "lini3": [x if x["position_id"] in mine else _masked(x) for x in r["lini3"]],
                "explanations": [],
                "pending_explanations": 0,
            }
        )
    return {**payload, "risks": risks}, masked


def _round1(n: float) -> float:
    return math.floor(n * 10 + 0.5) / 10


def mutu_from_payload(p: Row) -> Row:
    """FR-LBR-004 computed from a (possibly masked) payload."""
    rows = []
    for risk_type in RISK_TYPES:
        of_type = [r for r in p["risks"] if r["risk_type"] == risk_type]
        cells = []
        for a_ in p["assessors"]:
            values = []
            for r in of_type:
                v = (
                    r["l1"]
                    if a_["line"] == 1
                    else next(
                        (x for x in r["lini3"] if x["position_id"] == a_["position_id"]), None
                    )
                )
                if v and v["opened"]:
                    values.append(v)
            scores = [
                float(v["score"])
                for v in values
                if not v["not_relevant"] and not v["not_assessed"] and v["score"] is not None
            ]
            average = _round1(sum(scores) / len(scores)) if scores else None
            cells.append(
                {
                    "predicate": None if average is None else predicate_for(average, p["bands"]),
                    "opened": len(values) > 0,
                }
            )
        rows.append({"risk_type": risk_type, "cells": cells})
    results = [x["result"] for r in p["risks"] for x in r["lini3"] if x["opened"]]
    return {
        "rows": rows,
        "sesuai": results.count("sesuai"),
        "tidak_sesuai": results.count("tidak_sesuai"),
        "berulang": len([r for r in p["risks"] if r["recurring"]]),
        "not_assessed_l1": [r["description"] for r in p["risks"] if r["l1"]["not_assessed"]],
    }


def freeze_ready(db: Db, position_id: str, quarter: Row, at: str) -> bool:
    """FR-LBR-009 freeze condition: every risk opened at least partially, every obligation
    closed."""
    items = quarter_risks(db, position_id, quarter)
    if not items:
        return False
    fy = _find(db["fiscal_years"], "year", quarter["fiscal_year"])
    tolerance = int(fy["tolerance_days"]) if fy else 7
    today = at[:10]
    for _, rq in items:
        opened = [
            r
            for r in db["results"]
            if r["risk_quarter_id"] == rq["id"] and _t(r["opened_at"]) <= _t(at)
        ]
        if not opened:
            return False
        for r in opened:
            if not (
                not r["explanation_required"]
                or r["explanation_status"] == "sent"
                or (
                    r["explanation_due_on"] is not None
                    and today > add_days(r["explanation_due_on"], tolerance)
                )
            ):
                return False
    return True


def snapshot_prefix(db: Db, kind: str, position_id: str, quarter: Row) -> str:
    p = _find(db["positions"], "id", position_id)
    assert p is not None
    unit = _find(db["org_units"], "id", p["org_unit_id"])
    assert unit is not None
    code = "LK" if kind == "komunikasi" else "LM"
    return (
        f"SIMARIO/{code}/{quarter['fiscal_year']}/TW{quarter['number']}/{unit['code']}-{p['code']}/"
    )


def snapshot_number(db: Db, kind: str, position_id: str, quarter: Row) -> str:
    """`SIMARIO/[LK|LM]/[TA]/TW[n]/[kode unit]-[kode jabatan]/[urut]` (§2.8 PrintSnapshot)."""
    prefix = snapshot_prefix(db, kind, position_id, quarter)
    seq = len([s for s in db["snapshots"] if s["number"].startswith(prefix)]) + 1
    return f"{prefix}{seq:03d}"
