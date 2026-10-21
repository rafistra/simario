"""Quarterly assessment read models (PRD ch. 7, FR-NIL-001 … 012). Ports buildAssessment,
buildQueue and finalisePreview in frontend/src/data/api/assessment.ts: visibility (VIS-1/2/3/4/5/9,
INV-16, INV-17) is applied here, so the page only receives what the viewer may see."""

import uuid
from collections.abc import Iterable
from typing import Any

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.board.models import Attachment, Comment
from simario.board.selectors import now_iso
from simario.board.serializers import (
    AssessmentRow,
    AttachmentRow,
    CommentRow,
    ResultRow,
    RiskQuarterRow,
    rows,
)
from simario.core.collections import COLLECTIONS
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.domain import register as register_rules
from simario.domain import visibility as vis
from simario.domain.score_bands import predicate_for
from simario.registers.models import Register, RegisterMitigation, RegisterRisk
from simario.registers.selectors import assert_can_read, permission_rows
from simario.registers.serializers import MitigationRow, RegisterRow, RiskRow

from .models import Assessment, ComparisonResult, RiskQuarter

Row = dict[str, Any]
Db = dict[str, Any]

RISK_TYPES = ("kinerja_anggaran", "ketidakpatuhan", "kecurangan")
_SHARED = (
    "orgUnits",
    "positionTypes",
    "positions",
    "fiscalYears",
    "quarters",
    "quarterAssessors",
    "stages",
    "scoreBandVersions",
    "scoreBands",
    "scoreOptions",
)


def _snake(name: str) -> str:
    return "".join(f"_{c.lower()}" if c.isupper() else c for c in name)


def assessment_db(position_ids: Iterable[Any] | None = None) -> Db:
    """Every row the assessment rules need, for the given Lini 1 positions (all when None) over
    all their fiscal years."""
    db: Db = dict(load_access_db())
    for name in _SHARED:
        qs, serializer = COLLECTIONS[name]
        db[_snake(name)] = rows(serializer, qs())
    registers = Register.objects.all()
    if position_ids is not None:
        registers = registers.filter(position_id__in=list(position_ids))
    risks = RegisterRisk.objects.filter(register__in=registers)
    db["registers"] = rows(RegisterRow, registers)
    db["risks"] = rows(RiskRow, risks)
    db["mitigations"] = rows(
        MitigationRow, RegisterMitigation.objects.filter(register_risk__in=risks)
    )
    db["declarations"] = []
    rqs = RiskQuarter.objects.filter(register_risk__in=risks)
    db["risk_quarters"] = rows(RiskQuarterRow, rqs)
    assessments = Assessment.objects.filter(risk_quarter__in=rqs)
    db["assessments"] = rows(AssessmentRow, assessments)
    db["results"] = rows(ResultRow, ComparisonResult.objects.filter(risk_quarter__in=rqs))
    db["comments"] = rows(CommentRow, Comment.objects.filter(register_risk__in=risks))
    db["attachments"] = rows(
        AttachmentRow,
        Attachment.objects.filter(owner_kind="assessment", owner_id__in=assessments.values("id")),
    )
    return db


def _find(items: Iterable[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _published(register: Row | None) -> bool:
    return bool(
        register
        and (register["status"] in ("published", "archived") or register.get("published_at"))
    )


def _archived(db: Db, year: int) -> bool:
    fy = _find(db["fiscal_years"], "year", year)
    return bool(fy and fy["status"] == "archived")


def _dir_name(name: str) -> str:
    return name.removeprefix("Direktorat ")


def shown_result(r: Row, lini1_holder: bool) -> Row:
    """Explanation drafts reach only the Lini 1 holders; everyone else sees sent text only."""
    if lini1_holder or r["explanation_status"] == "sent":
        return r
    return {**r, "explanation_reason": None, "explanation_plan": None}


def to_display(db: Db, a: Row) -> Row:
    """An assessment as users may see it: the statement replaces the number (PRD v2.8)."""
    out = {k: v for k, v in a.items() if k != "score"}
    out["option_label"] = rules.option_label_of(db, a["score_band_version_id"], a["score"])
    return out


def attachments_of(db: Db, viewer: Row, assessment_id: str) -> tuple[list[Row], int]:
    out: list[Row] = []
    hidden = 0
    for f in db["attachments"]:
        if f["owner_kind"] != "assessment" or f["owner_id"] != assessment_id:
            continue
        if f["scan_status"] == "quarantined":
            continue
        if f["is_confidential"] and not viewer["can_see_confidential"]:
            hidden += 1
            continue
        if f["scan_status"] == "pending":
            if f["uploaded_by_id"] == viewer["user_id"]:
                out.append({"attachment": f, "scanning": True})
            continue
        if vis.can_see_attachment(viewer, f):
            out.append({"attachment": f, "scanning": False})
    return out, hidden


def _quarter(db: Db, fiscal_year: int, tw: int) -> Row:
    q = next(
        (x for x in db["quarters"] if x["fiscal_year"] == fiscal_year and x["number"] == tw), None
    )
    if q is None:
        raise ApiError("not_found", f"Triwulan TW {tw} TA {fiscal_year} tidak ditemukan.")
    found: Row = q
    return found


def build_assessment(
    user: User, position_id: uuid.UUID, fiscal_year: int, tw: int, blind_requested: bool = False
) -> Row:
    at = now_iso()
    today = at[:10]
    uid = str(user.id)
    pid = str(position_id)
    db = assessment_db([position_id])
    quarter = _quarter(db, fiscal_year, tw)
    position = _find(db["positions"], "id", pid)
    if position is None:
        raise ApiError("not_found", "Jabatan tidak ditemukan.")
    assert_can_read(user, pid, fiscal_year)
    perms = permission_rows()
    quarters = sorted(
        (q for q in db["quarters"] if q["fiscal_year"] == fiscal_year), key=lambda q: q["number"]
    )
    register = next(
        (r for r in db["registers"] if r["position_id"] == pid and r["fiscal_year"] == fiscal_year),
        None,
    )
    published = _published(register)
    archived = _archived(db, fiscal_year)
    blind_allowed = access.has_permission(db, uid, 24, today)
    viewer = vis.viewer_for(db, uid, today, blind_requested and blind_allowed)
    expected = board_rules.expected_lini3(db, quarter["id"])
    holdings = access.holdings_of(db, uid, today)

    mode = "reader"
    holding = next((h for h in holdings if h["position_id"] == pid), None)
    own_position_id: str | None = None
    if holding and access.has_permission(db, uid, 4, today):
        mode = "lini1"
        own_position_id = pid
    else:
        holding = next(
            (h for h in holdings if h["line"] == 3 and h["position_id"] in expected), None
        )
        if holding and access.has_permission(db, uid, 8, today):
            mode = "lini3"
            own_position_id = holding["position_id"]
        else:
            holding = None
    own_line = 3 if mode == "lini3" else 1
    draft_ok = bool(
        own_position_id
        and access.check_action(db, perms, uid, 4 if own_line == 1 else 8, own_position_id, today)[
            "ok"
        ]
    )
    finalise_ok = bool(
        own_position_id
        and access.check_action(db, perms, uid, 5 if own_line == 1 else 9, own_position_id, today)[
            "ok"
        ]
    )
    is_open = rules.window_open(quarter, own_line, today)
    official = access.finalising_official(db, own_position_id, today) if own_position_id else None

    all_stages = register_rules.register_stages(db, register) if register else []
    stages = [s for s in all_stages if s["active"]]
    items = rules.quarter_risks(db, pid, quarter) if published else []
    columns = [(pid, 1)] + [(p, 3) for p in expected]
    counts = {"waiting": 0, "partial": 0, "open": 0}
    progress = {"finalised": 0, "ready": 0, "draft": 0, "unscored": 0, "total": len(items)}
    pending_expl = 0
    ready_expl = 0
    nearest_due: str | None = None
    lini1_holder = mode == "lini1"

    out_rows: list[Row] = []
    for risk, rq in items:
        opened = board_rules.opened_results(db, rq["id"], at)
        opened_set = {r["lini3_position_id"] for r in opened}
        counts[rules.comparison_status_at(db, rq, at)] += 1
        late = (
            vis.is_late_directorate(viewer, opened_set, expected)
            and not viewer["blind_view_granted"]
        )
        cells: list[Row] = []
        for col_id, line in columns:
            p = _find(db["positions"], "id", col_id)
            a = next(
                (
                    x
                    for x in db["assessments"]
                    if x["risk_quarter_id"] == rq["id"] and x["assessor_position_id"] == col_id
                ),
                None,
            )
            own = col_id == own_position_id
            if a is not None:
                frozen = rules.assessment_frozen(db, a, at)
            else:
                frozen = len(opened) > 0 if line == 1 else col_id in opened_set
            visible = own or viewer["blind_view_granted"]
            if not visible and a is not None:
                visible = vis.can_see_assessment(viewer, a, opened_set, expected) and a[
                    "status"
                ] in ("final", "not_assessed")
            files, hidden = (
                attachments_of(db, viewer, a["id"]) if a is not None and visible else ([], 0)
            )
            result = (
                next((r for r in opened if r["lini3_position_id"] == col_id), None)
                if line == 3 and not late
                else None
            )
            status = a["status"] if a else None
            name = p["name"] if p else ""
            if line == 1:
                overdue = (a is None or status not in ("final", "not_assessed")) and today > str(
                    quarter["lini1_deadline"]
                )
            else:
                overdue = rules.lini3_overdue(quarter, a, today) and col_id not in opened_set
            cells.append(
                {
                    "position_id": col_id,
                    "line": line,
                    "label": f"Lini {line} · {name if line == 1 else _dir_name(name)}",
                    "short_label": "L1"
                    if line == 1
                    else ((p or {}).get("short_name") or (p or {}).get("code") or ""),
                    "own": own,
                    "visible": visible,
                    "editable": own
                    and draft_ok
                    and is_open
                    and not frozen
                    and not archived
                    and status not in ("final", "not_assessed"),
                    "assessment": to_display(db, a) if visible and a is not None else None,
                    "selected_value": a["score"] if own and a is not None else None,
                    "attachments": files,
                    "confidential_hidden": hidden,
                    "result": shown_result(result, lini1_holder) if result else None,
                    "overdue": overdue,
                    "can_reopen": own
                    and finalise_ok
                    and status == "final"
                    and not frozen
                    and not archived,
                    "frozen": frozen,
                }
            )

        visible_results = [] if late else opened
        summary = "waiting"
        if visible_results:
            if any(r["result"] == "tidak_sesuai" for r in visible_results):
                summary = "tidak_sesuai"
            elif len(visible_results) < len(expected):
                summary = "partial"
            elif all(r["result"] == "incomparable" for r in visible_results):
                summary = "incomparable"
            else:
                summary = "sesuai"

        explanations: list[Row] = []
        for r in visible_results:
            if r["result"] != "tidak_sesuai" or not vis.can_see_result(
                viewer, opened_set, expected
            ):
                continue
            sent = r["explanation_status"] == "sent"
            if lini1_holder and not sent and r["explanation_required"]:
                if r["explanation_status"] == "ready":
                    ready_expl += 1
                else:
                    pending_expl += 1
                due = r["explanation_due_on"]
                if due and (nearest_due is None or due < nearest_due):
                    nearest_due = due
            sender = (
                _find(db["users"], "id", r["explanation_sent_by_user_id"])
                if r["explanation_sent_by_user_id"]
                else None
            )
            directorate = _find(db["positions"], "id", r["lini3_position_id"])
            show_text = sent or lini1_holder
            explanations.append(
                {
                    "result": shown_result(r, lini1_holder),
                    "directorate": directorate["name"] if directorate else "",
                    "show_text": show_text,
                    "editable": lini1_holder
                    and draft_ok
                    and not sent
                    and r["explanation_status"] != "not_sent"
                    and not archived,
                    "sent_by_name": sender["full_name"] if sender else None,
                    "pending_lateness": None
                    if sent
                    else rules.pending_explanation_lateness(db, r, today, fiscal_year),
                }
            )

        own_cell = next((c for c in cells if c["own"]), None)
        if own_cell is not None:
            shown = own_cell["assessment"]
            s = shown["status"] if shown else None
            if s in ("final", "not_assessed"):
                progress["finalised"] += 1
            elif s == "ready":
                progress["ready"] += 1
            elif shown and (own_cell["selected_value"] is not None or shown["not_relevant"]):
                progress["draft"] += 1
            else:
                progress["unscored"] += 1
        stage = _find(db["stages"], "id", risk["stage_id"])
        assert stage is not None
        out_rows.append(
            {
                "rq": rq,
                "risk": risk,
                "stage": stage,
                "stage_index": (stages.index(stage) + 1) if stage in stages else 0,
                "risk_type": risk["risk_type"],
                "quiet": board_rules.is_quiet(db, risk, quarter)
                and quarter["starts_on"] <= today <= quarter["ends_on"],
                "recurring": not late and rq["recurring"] and len(opened) > 0,
                "summary": summary,
                "cells": cells,
                "explanations": explanations,
                "pinned": lini1_holder
                and any(
                    e["result"]["explanation_required"]
                    and e["result"]["explanation_status"] != "sent"
                    for e in explanations
                ),
            }
        )

    def stage_order(s: Row) -> int:
        return all_stages.index(s) if s in all_stages else len(all_stages)

    out_rows.sort(
        key=lambda r: (
            -int(r["pinned"]),
            stage_order(r["stage"]),
            RISK_TYPES.index(r["risk_type"]),
            r["risk"]["order"],
        )
    )

    band_version = rules.band_version_for(db, quarter)
    bands = sorted(
        (b for b in db["score_bands"] if b["version_id"] == band_version), key=lambda b: b["order"]
    )
    if not items or counts["waiting"] == len(items):
        overall = "waiting"
    elif counts["open"] == len(items):
        overall = "open"
    else:
        overall = "partial"
    version = _find(db["score_band_versions"], "id", band_version)
    return {
        "quarter": quarter,
        "quarters": quarters,
        "position_id": pid,
        "position_name": position["name"],
        "published": published,
        "archived": archived,
        "mode": mode,
        "own_position_id": own_position_id,
        "holding": holding,
        "can_finalise": finalise_ok and not archived,
        "is_operator": bool(holding and holding["capacity"] == "operator"),
        "official_name": official["full_name"] if official else None,
        "window_open": is_open,
        "opens_on": rules.window_opens_on(quarter, own_line),
        "status": overall,
        "counts": counts,
        "options": [
            {
                "value": o["value"],
                "label": o["label"],
                "predicate": predicate_for(o["value"], bands),
            }
            for o in rules.options_of(db, band_version)
        ],
        "guidance": [{"predicate": b["predicate"], "guidance": b["guidance"]} for b in bands],
        "band_version_number": version["number"] if version else None,
        "rows": out_rows,
        "progress": progress,
        "explanations": {"pending": pending_expl, "ready": ready_expl, "nearest_due": nearest_due},
        "blind": {
            "allowed": blind_allowed and mode == "reader",
            "granted": viewer["blind_view_granted"],
        },
    }


# ---------- Lini 3 queue (FR-NIL-010) ----------


def _open_quarters(db: Db, today: str) -> list[Row]:
    return [
        q
        for q in db["quarters"]
        if q["lini3_opens_on"] <= today and not _archived(db, q["fiscal_year"])
    ]


def default_queue_quarter(db: Db, today: str, directorate_id: str | None) -> Row:
    """FR-NIL-010 default: the open quarter with the earliest Lini 3 deadline that still has work
    for the directorate (an overdue quarter comes first); otherwise the next upcoming deadline."""
    open_qs = sorted(_open_quarters(db, today), key=lambda q: q["lini3_deadline"])

    def outstanding(q: Row) -> bool:
        if not directorate_id:
            return False
        for p in db["positions"]:
            for _, rq in rules.quarter_risks(db, p["id"], q):
                a = next(
                    (
                        x
                        for x in db["assessments"]
                        if x["risk_quarter_id"] == rq["id"]
                        and x["assessor_position_id"] == directorate_id
                    ),
                    None,
                )
                if a is None or a["status"] != "final":
                    return True
        return False

    return (
        next((q for q in open_qs if q["lini3_deadline"] < today and outstanding(q)), None)
        or next((q for q in open_qs if q["lini3_deadline"] >= today), None)
        or (open_qs[-1] if open_qs else db["quarters"][0])
    )


def build_queue(user: User, quarter_id: str | None) -> Row:
    at = now_iso()
    today = at[:10]
    db = assessment_db()
    uid = str(user.id)
    holding = next((h for h in access.holdings_of(db, uid, today) if h["line"] == 3), None)
    directorate = _find(db["positions"], "id", holding["position_id"]) if holding else None
    quarter = (
        _find(db["quarters"], "id", quarter_id) if quarter_id else None
    ) or default_queue_quarter(db, today, directorate["id"] if directorate else None)
    quarters = sorted(_open_quarters(db, today), key=lambda q: (-q["fiscal_year"], -q["number"]))
    types = {t["id"]: t for t in db["position_types"]}
    units = {u["id"]: u for u in db["org_units"]}
    out = []
    for p in db["positions"]:
        ptype = types.get(p["position_type_id"])
        if not p["active"] or not ptype or ptype["line"] != 1:
            continue
        unit = units[p["org_unit_id"]]
        base = {
            "position_id": p["id"],
            "position_name": p["name"],
            "unit_name": unit["name"],
            "unit_id": unit["id"],
            "type_name": ptype["name"],
            "type_id": ptype["id"],
        }
        register = next(
            (
                r
                for r in db["registers"]
                if r["position_id"] == p["id"] and r["fiscal_year"] == quarter["fiscal_year"]
            ),
            None,
        )
        if not _published(register):
            out.append(
                {
                    **base,
                    "assessed": 0,
                    "total": 0,
                    "status": "belum_terbit",
                    "lini1_done": False,
                    "tidak_sesuai": 0,
                    "recurring": 0,
                    "not_assessed_l1": 0,
                    "overdue": False,
                }
            )
            continue
        items = rules.quarter_risks(db, p["id"], quarter)

        def of(rq: Row, *, position: str | None = None, line: int | None = None) -> Row | None:
            return next(
                (
                    a
                    for a in db["assessments"]
                    if a["risk_quarter_id"] == rq["id"]
                    and (position is None or a["assessor_position_id"] == position)
                    and (line is None or a["assessor_line"] == line)
                ),
                None,
            )

        dir_id = directorate["id"] if directorate else None
        mine = [of(rq, position=dir_id) if dir_id else None for _, rq in items]
        assessed = len([a for a in mine if a and a["status"] == "final"])
        if items and assessed == len(items):
            status = "dituntaskan"
        elif any(a and a["status"] == "ready" for a in mine):
            status = "siap"
        elif any(a for a in mine):
            status = "draf"
        else:
            status = "belum"
        l1 = [of(rq, line=1) for _, rq in items]
        # Attention counts only where this directorate's own result has opened (VIS-9).
        own_opened = [
            rq for _, rq in items if dir_id and rules.result_opened(db, rq["id"], dir_id, at)
        ]
        out.append(
            {
                **base,
                "assessed": assessed,
                "total": len(items),
                "status": status,
                "lini1_done": bool(items)
                and all(a and a["status"] in ("final", "not_assessed") for a in l1),
                "tidak_sesuai": len(
                    [
                        rq
                        for rq in own_opened
                        if any(
                            r["result"] == "tidak_sesuai"
                            for r in board_rules.opened_results(db, rq["id"], at)
                        )
                    ]
                ),
                "recurring": len([rq for rq in own_opened if rq["recurring"]]),
                "not_assessed_l1": len(
                    [
                        rq
                        for rq in own_opened
                        if (of(rq, line=1) or {}).get("status") == "not_assessed"
                    ]
                ),
                "overdue": status != "dituntaskan" and today > quarter["lini3_deadline"],
            }
        )
    return {
        "directorate": {"id": directorate["id"], "name": directorate["name"]}
        if directorate
        else None,
        "quarter": quarter,
        "quarters": quarters,
        "rows": out,
    }


# ---------- Finalise preview (FR-NIL-003) ----------


def line_of(db: Db, position_id: str) -> int:
    """Line of an assessor position (1 = the risk's own position, 3 = a directorate)."""
    p = _find(db["positions"], "id", position_id)
    t = _find(db["position_types"], "id", p["position_type_id"]) if p else None
    return 3 if t and t["line"] == 3 else 1


def finalise_candidates(
    db: Db, lini1_position_id: str, quarter: Row, assessor_position_id: str, at: str
) -> Row:
    line = line_of(db, assessor_position_id)
    rows_: list[Row] = []
    for risk, rq in rules.quarter_risks(db, lini1_position_id, quarter):
        a = next(
            (
                x
                for x in db["assessments"]
                if x["risk_quarter_id"] == rq["id"]
                and x["assessor_position_id"] == assessor_position_id
            ),
            None,
        )
        rows_.append({"risk": risk, "rq": rq, "a": a})
    open_ = [
        r
        for r in rows_
        if not rules.assessment_frozen(
            db,
            {
                "risk_quarter_id": r["rq"]["id"],
                "assessor_line": line,
                "assessor_position_id": assessor_position_id,
            },
            at,
        )
        and (r["a"] is None or r["a"]["status"] not in ("final", "not_assessed"))
    ]
    scored = [
        r
        for r in open_
        if r["a"] is not None
        and (r["a"]["score"] is not None or (line == 1 and r["a"]["not_relevant"]))
    ]
    return {"line": line, "rows": rows_, "open": open_, "scored": scored}


def finalise_preview_of(
    db: Db, lini1_position_id: str, quarter: Row, assessor_position_id: str, at: str
) -> Row:
    c = finalise_candidates(db, lini1_position_id, quarter, assessor_position_id, at)
    with_files = {f["owner_id"] for f in db["attachments"] if f["owner_kind"] == "assessment"}
    return {
        "to_finalise": len(c["scored"]),
        "unscored": len(c["open"]) - len(c["scored"]),
        "no_evidence": [
            r["risk"]["description_snapshot"]
            for r in c["scored"]
            if not r["a"]["not_relevant"] and r["a"]["id"] not in with_files
        ]
        if c["line"] == 1
        else [],
        "missing_reason": [
            r["risk"]["description_snapshot"]
            for r in c["scored"]
            if r["a"]["not_relevant"] and not (r["a"]["not_relevant_reason"] or "").strip()
        ],
    }


def finalise_preview(
    user: User, position_id: uuid.UUID, fiscal_year: int, tw: int, assessor_position_id: str
) -> Row:
    db = assessment_db([position_id])
    quarter = _quarter(db, fiscal_year, tw)
    assert_can_read(user, str(position_id), fiscal_year)
    return finalise_preview_of(db, str(position_id), quarter, assessor_position_id, now_iso())
