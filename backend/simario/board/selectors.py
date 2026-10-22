"""Board and thread read models (FR-PPN-001, 002). Ports buildBoard and buildThread in
frontend/src/data/api/board.ts: visibility (VIS-1/2/3/6/9) is applied here, so the page only
receives what the viewer may see."""

import uuid
from typing import Any

from django.db.models import Q
from rest_framework import serializers

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.assessments.models import Assessment, ComparisonResult, RiskQuarter
from simario.calendar.models import FiscalYear, QuarterAssessor
from simario.core import clock
from simario.core.collections import FiscalYearRow, QuarterAssessorRow, ScoreOptionRow
from simario.core.errors import ApiError
from simario.core.format import format_date
from simario.domain import access
from simario.domain import board as rules
from simario.domain import register as register_rules
from simario.domain import visibility as vis
from simario.org.models import Position
from simario.reference.models import ScoreOption
from simario.registers.models import RegisterRisk
from simario.registers.selectors import assert_can_read, register_db

from .models import Attachment, Comment, ThreadSubscription, ThreadView
from .serializers import (
    AssessmentRow,
    AttachmentRow,
    CommentRow,
    ResultRow,
    RiskQuarterRow,
    SubscriptionRow,
    ThreadViewRow,
    rows,
)

Row = dict[str, Any]
Db = dict[str, Any]
ROMAN = ("I", "II", "III", "IV")
_DT = serializers.DateTimeField()


def now_iso() -> str:
    """The simulated now in the same text form as the rows (WITA with offset)."""
    return str(_DT.to_representation(clock.now()))


def board_db(position: Position) -> Db:
    """Every row the board rules need for one Lini 1 position (all its fiscal years)."""
    db: Db = dict(load_access_db())
    positions = {
        str(p.id): {"name": p.name, "short_name": p.short_name, "code": p.code}
        for p in Position.objects.all()
    }
    db["positions"] = [{**p, **positions[p["id"]]} for p in db["positions"]]
    reg = register_db(position)
    for key in ("registers", "risks", "mitigations", "declarations", "stages", "quarters"):
        db[key] = reg[key]
    risk_ids = [r["id"] for r in db["risks"]]
    rqs = RiskQuarter.objects.filter(register_risk_id__in=risk_ids)
    db["risk_quarters"] = rows(RiskQuarterRow, rqs)
    db["assessments"] = rows(AssessmentRow, Assessment.objects.filter(risk_quarter__in=rqs))
    db["results"] = rows(ResultRow, ComparisonResult.objects.filter(risk_quarter__in=rqs))
    db["quarter_assessors"] = rows(QuarterAssessorRow, QuarterAssessor.objects.all())
    comments = Comment.objects.filter(register_risk_id__in=risk_ids).prefetch_related("mentions")
    db["comments"] = rows(CommentRow, comments)
    owners = [c["id"] for c in db["comments"]] + [a["id"] for a in db["assessments"]]
    db["attachments"] = rows(AttachmentRow, Attachment.objects.filter(owner_id__in=owners))
    db["subscriptions"] = rows(
        SubscriptionRow, ThreadSubscription.objects.filter(register_risk_id__in=risk_ids)
    )
    db["thread_views"] = rows(
        ThreadViewRow, ThreadView.objects.filter(register_risk_id__in=risk_ids)
    )
    db["fiscal_years"] = rows(FiscalYearRow, FiscalYear.objects.all())
    db["score_options"] = rows(ScoreOptionRow, ScoreOption.objects.all())
    return db


def _find(items: list[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _is_published(x: Row) -> bool:
    return x["status"] in ("active", "inactive")


def _inactive_label(db: Db, risk: Row) -> str:
    q = _find(db["quarters"], "id", risk["deactivated_from_quarter_id"])
    register = _find(db["registers"], "id", risk["register_id"])
    return register_rules.inactive_label(q, register["fiscal_year"] if register else 0)


def _option_label(db: Db, version_id: str | None, score: float | None) -> str | None:
    if score is None:
        return None
    option = next(
        (
            o
            for o in db["score_options"]
            if o["version_id"] == version_id and round(o["value"] * 10) == round(score * 10)
        ),
        None,
    )
    return option["label"] if option else None


def _q_order(q: Row) -> int:
    return int(q["fiscal_year"]) * 10 + int(q["number"])


def _position(position_id: Any) -> Position:
    position = Position.objects.filter(pk=position_id).first()
    if position is None:
        raise ApiError("not_found", "Jabatan tidak ditemukan.")
    return position


# ---------- Board ----------


def build_board(user: User, position_id: uuid.UUID, fiscal_year: int) -> Row:
    position = _position(position_id)
    assert_can_read(user, str(position.id), fiscal_year)
    at = now_iso()
    today = at[:10]
    uid = str(user.id)
    db = board_db(position)
    viewer = vis.viewer_for(db, uid, today)
    register = next((r for r in db["registers"] if r["fiscal_year"] == fiscal_year), None)
    fy = _find(db["fiscal_years"], "year", fiscal_year)
    archived = bool(fy and fy["status"] == "archived")
    published = bool(
        register and (register["status"] in ("published", "archived") or register["published_at"])
    )
    current = rules.posting_quarter(db, fiscal_year, today)
    if not register or not published:
        return {
            "published": False,
            "archived": archived,
            "current_quarter": current,
            "groups": [],
            "total": 0,
        }

    risks = [r for r in db["risks"] if r["register_id"] == register["id"] and _is_published(r)]
    board_rows: dict[str, Row] = {}
    for risk in risks:
        comments = [c for c in db["comments"] if c["register_risk_id"] == risk["id"]]
        counts = {1: 0, 2: 0, 3: 0}
        for c in comments:
            if not c["withdrawn_at"]:
                counts[c["author_line"]] += 1
        others = [c["created_at"] for c in comments if c["author_user_id"] != uid]
        last_other = max(others) if others else None
        seen = next(
            (
                v["last_seen_at"]
                for v in db["thread_views"]
                if v["user_id"] == uid and v["register_risk_id"] == risk["id"]
            ),
            None,
        )
        opened = rules.latest_opened(db, viewer, risk, at)
        markers = []
        if rules.is_quiet(db, risk, current):
            markers.append("belum-langkah")
        if opened and opened["tidak_sesuai"]:
            markers.append("tidak-sesuai")
        if opened and opened["recurring"]:
            markers.append("berulang")
        if "no_mitigation" in risk["flags"]:
            markers.append("tanpa-mitigasi")
        if risk["status"] == "inactive":
            markers.append("nonaktif")
        board_rows[risk["id"]] = {
            "risk": risk,
            "mitigations": len(
                [
                    m
                    for m in db["mitigations"]
                    if m["register_risk_id"] == risk["id"] and m["status"] == "active"
                ]
            ),
            "counts": counts,
            "last_activity": rules.last_activity(db, risk["id"]),
            "unseen": bool(last_other and (not seen or last_other > seen)),
            "opened": opened,
            "markers": markers,
            "inactive_label": _inactive_label(db, risk) if risk["status"] == "inactive" else None,
        }

    stages = register_rules.register_stages(db, register)
    active = [s for s in stages if s["active"]]

    def decl(stage_id: str, risk_type: str | None) -> Row | None:
        return next(
            (
                d
                for d in db["declarations"]
                if d["register_id"] == register["id"]
                and d["stage_id"] == stage_id
                and d["risk_type"] == risk_type
            ),
            None,
        )

    groups = []
    for stage in stages:
        types = []
        for rt in register_rules.RISK_TYPES:
            section = sorted(
                (r for r in risks if r["stage_id"] == stage["id"] and r["risk_type"] == rt),
                key=lambda r: (r["status"] == "inactive", r["is_custom"], r["order"]),
            )
            types.append(
                {
                    "risk_type": rt,
                    "declaration": decl(stage["id"], rt),
                    "rows": [board_rows[r["id"]] for r in section],
                }
            )
        group = {
            "stage": stage,
            "index": active.index(stage) + 1 if stage in active else 0,
            "not_relevant": decl(stage["id"], None),
            "types": types,
        }
        if group["not_relevant"] or any(t["rows"] or t["declaration"] for t in types):
            groups.append(group)
    return {
        "published": True,
        "archived": archived,
        "current_quarter": current,
        "groups": groups,
        "total": len(risks),
    }


# ---------- Thread ----------


def _attachments_for(db: Db, viewer: Row, owner_id: str) -> tuple[list[Row], int]:
    out: list[Row] = []
    hidden = 0
    for a in db["attachments"]:
        if a["owner_kind"] != "comment" or a["owner_id"] != owner_id:
            continue
        if a["is_confidential"] and not viewer["can_see_confidential"]:
            hidden += 1
            continue
        if vis.can_see_attachment(viewer, a):
            out.append({"attachment": a})
    return out, hidden


def _local(at: str) -> str:
    """'2027-04-06T09:00:00+08:00' → '6 Apr 2027 09.00' (formatDateTime)."""
    import datetime as dt

    d = dt.datetime.fromisoformat(at)
    return f"{format_date(d.date())} {d:%H.%M}"


def build_thread(user: User, risk_id: uuid.UUID) -> Row:
    risk_obj = RegisterRisk.objects.select_related("register__position").filter(pk=risk_id).first()
    if risk_obj is None or risk_obj.status not in ("active", "inactive"):
        raise ApiError("not_found", "Risiko tidak ditemukan.")
    position = risk_obj.register.position
    assert_can_read(user, str(position.id), risk_obj.register.fiscal_year_id)
    at = now_iso()
    today = at[:10]
    uid = str(user.id)
    db = board_db(position)
    viewer = vis.viewer_for(db, uid, today)
    risk = _find(db["risks"], "id", str(risk_obj.id))
    assert risk is not None
    register = _find(db["registers"], "id", risk["register_id"])
    assert register is not None
    stages = [s for s in register_rules.register_stages(db, register) if s["active"]]
    stage = _find(db["stages"], "id", risk["stage_id"])
    fy = _find(db["fiscal_years"], "year", register["fiscal_year"])
    archived_on = fy["archived_at"] if fy and fy["status"] == "archived" else None
    posting = None if archived_on else rules.posting_quarter(db, register["fiscal_year"], today)
    names = {u["id"]: u["full_name"] for u in db["users"]}
    positions = {p["id"]: p for p in db["positions"]}
    quarters = {q["id"]: q for q in db["quarters"]}

    def name(user_id: str | None) -> str:
        return str(names.get(user_id or "", "—"))

    def to_comment(c: Row) -> Row:
        files, hidden = ([], 0) if c["withdrawn_at"] else _attachments_for(db, viewer, c["id"])
        pos = positions.get(c["acting_position_id"]) or {}
        return {
            "id": c["id"],
            "author_user_id": c["author_user_id"],
            "author_name": name(c["author_user_id"]),
            "line": c["author_line"],
            "capacity": c["acting_as"],
            "position_name": pos.get("name", ""),
            "created_at": c["created_at"],
            "edited": bool(c["edited_at"]),
            "is_step": bool(c["is_step"]) and not c["withdrawn_at"],
            "body": None if c["withdrawn_at"] else c["body"],
            "withdrawn_text": (
                f"Komentar ditarik oleh {name(c['withdrawn_by_user_id'])} pada "
                f"{_local(c['withdrawn_at'])}"
            )
            if c["withdrawn_at"]
            else None,
            "attachments": files,
            "confidential_hidden": hidden,
            "can_edit": not archived_on and rules.can_edit_comment(c, uid, at),
            "can_withdraw": not archived_on
            and c["author_user_id"] == uid
            and not c["withdrawn_at"],
            "quarter_id": c["quarter_id"],
            "is_own": c["author_user_id"] == uid,
        }

    def group(mitigation_id: str | None) -> list[Row]:
        items = sorted(
            (
                c
                for c in db["comments"]
                if c["register_risk_id"] == risk["id"]
                and c["register_mitigation_id"] == mitigation_id
            ),
            key=lambda c: c["created_at"],
        )
        by_q: dict[str, Row] = {}

        def ensure(qid: str) -> Row:
            if qid not in by_q:
                by_q[qid] = {"quarter": quarters[qid], "comments": [], "steps": 0, "events": []}
            return by_q[qid]

        if mitigation_id is None and risk["published_at"]:
            q = rules.posting_quarter(db, register["fiscal_year"], risk["published_at"][:10])
            if q:
                ensure(q["id"])["events"].append(
                    {
                        "text": f"Risiko diterbitkan oleh {name(register['published_by_user_id'])}",
                        "at": risk["published_at"],
                    }
                )
        if mitigation_id is None and risk["deactivated_at"]:
            q = rules.posting_quarter(db, register["fiscal_year"], risk["deactivated_at"][:10])
            if q:
                ensure(q["id"])["events"].append(
                    {
                        "text": f"Risiko dinonaktifkan — {risk['deactivation_reason'] or ''}",
                        "at": risk["deactivated_at"],
                    }
                )
        for c in items:
            g = ensure(c["quarter_id"])
            tc = to_comment(c)
            g["comments"].append(tc)
            if tc["is_step"]:
                g["steps"] += 1
        if mitigation_id is None and posting:
            ensure(posting["id"])
        return sorted(by_q.values(), key=lambda g: _q_order(g["quarter"]))

    mitigations = []
    for m in sorted(
        (m for m in db["mitigations"] if m["register_risk_id"] == risk["id"] and _is_published(m)),
        key=lambda m: m["order"],
    ):
        qs = group(m["id"])
        everything = [c for g in qs for c in g["comments"]]
        times = [c["created_at"] for c in everything]
        mitigations.append(
            {
                "id": m["id"],
                "description": m["description_snapshot"],
                "inactive": m["status"] == "inactive",
                "is_custom": m["is_custom"],
                "quarters": qs,
                "count": len([c for c in everything if c["body"] is not None]),
                "steps": len([c for c in everything if c["is_step"]]),
                "last_activity": max(times) if times else None,
            }
        )

    held = set(viewer["held_position_ids"])

    def card(rq: Row, fiscal_year: int, card_position_id: str) -> Row:
        quarter = quarters[rq["quarter_id"]]
        opened = rules.opened_results(db, rq["id"], at)
        opened_set = {r["lini3_position_id"] for r in opened}
        expected = rules.expected_lini3(db, quarter["id"])
        status = (
            "waiting" if not opened else ("open" if len(opened) >= len(expected) else "partial")
        )
        visible: list[Row] = []
        hidden_labels: list[str] = []
        assessments = [a for a in db["assessments"] if a["risk_quarter_id"] == rq["id"]]
        l1 = next((a for a in assessments if a["assessor_line"] == 1), None)

        def cell(a: Row | None, pos_id: str, line: int) -> None:
            p = positions.get(pos_id) or {}
            label = (
                f"Lini 1 · {p.get('name', '')}"
                if line == 1
                else (p.get("short_name") or p.get("name") or "")
            )
            if a is None and pos_id in held:
                visible.append(
                    {
                        "label": label,
                        "position_name": p.get("name", ""),
                        "line": line,
                        "option_label": None,
                        "predicate": None,
                        "status": "draft",
                        "not_relevant": False,
                        "own": True,
                    }
                )
                return
            if a is not None and vis.can_see_assessment(viewer, a, opened_set, expected):
                own = pos_id in held
                if not own and a["status"] not in ("final", "not_assessed"):
                    hidden_labels.append("Lini 1" if line == 1 else p.get("name", ""))
                    return
                entry: Row = {
                    "label": label,
                    "position_name": p.get("name", ""),
                    "line": line,
                    "option_label": _option_label(db, a["score_band_version_id"], a["score"]),
                    "predicate": a["predicate"],
                    "status": a["status"],
                    "not_relevant": a["not_relevant"],
                    "own": own,
                }
                if line == 3:
                    res = next((r for r in opened if r["lini3_position_id"] == pos_id), None)
                    if res:
                        entry["result"] = res["result"]
                visible.append(entry)
            else:
                hidden_labels.append(
                    "Lini 1" if line == 1 else str(p.get("name", "")).replace("Direktorat ", "")
                )

        cell(l1, l1["assessor_position_id"] if l1 else card_position_id, 1)
        for pid in expected:
            cell(next((a for a in assessments if a["assessor_position_id"] == pid), None), pid, 3)
        pending = (
            next(
                (
                    r
                    for r in opened
                    if r["explanation_required"] and r["explanation_status"] in ("pending", "ready")
                ),
                None,
            )
            if card_position_id in held and fiscal_year == register["fiscal_year"]
            else None
        )
        return {
            "quarter": quarter,
            "fiscal_year": fiscal_year,
            "status": status,
            "visible": visible,
            "hidden_labels": hidden_labels,
            "pending_explanation": {"due_on": pending["explanation_due_on"]} if pending else None,
            "href": f"/jabatan/{card_position_id}/penilaian/{fiscal_year}/{quarter['number']}",
            "link_label": f"Buka Penilaian TW {ROMAN[quarter['number'] - 1]}",
        }

    def quarters_of(risk_id_: str) -> list[Row]:
        return sorted(
            (rq for rq in db["risk_quarters"] if rq["register_risk_id"] == risk_id_),
            key=lambda rq: _q_order(quarters[rq["quarter_id"]]),
            reverse=True,
        )

    own_cards = [
        card(rq, register["fiscal_year"], register["position_id"]) for rq in quarters_of(risk["id"])
    ]
    prev = (
        _find(db["risks"], "id", risk["previous_year_risk_id"])
        if risk["previous_year_risk_id"]
        else None
    )
    prev_register = _find(db["registers"], "id", prev["register_id"]) if prev else None
    prev_cards = []
    if prev and prev_register:
        for rq in quarters_of(prev["id"])[:1]:
            prev_cards.append(
                {
                    **card(rq, prev_register["fiscal_year"], prev_register["position_id"]),
                    "href": f"/jabatan/{prev_register['position_id']}/riwayat",
                    "link_label": "Riwayat TA sebelumnya",
                }
            )
    nxt = next(
        (r for r in db["risks"] if r["previous_year_risk_id"] == risk["id"] and _is_published(r)),
        None,
    )
    next_register = _find(db["registers"], "id", nxt["register_id"]) if nxt else None

    participation = (
        access.participation_holding(db, uid, register["position_id"], posting["id"], today)
        if posting
        else None
    )
    related = rules.related_quarters(db, risk, posting, at) if posting and participation else []
    current_rq = (
        next(
            (
                rq
                for rq in db["risk_quarters"]
                if rq["register_risk_id"] == risk["id"] and rq["quarter_id"] == posting["id"]
            ),
            None,
        )
        if posting
        else None
    )
    own_lini3_opened = bool(
        current_rq
        and any(
            any(r["lini3_position_id"] == p for r in rules.opened_results(db, current_rq["id"], at))
            for p in viewer["lini3_position_ids"]
        )
    )
    latest = rules.latest_opened(db, viewer, risk, at)

    def url(reg: Row, r: Row) -> str:
        return f"/jabatan/{reg['position_id']}/papan/{reg['fiscal_year']}/risiko/{r['id']}"

    return {
        "risk": risk,
        "position_id": register["position_id"],
        "fiscal_year": register["fiscal_year"],
        "stage": stage,
        "stage_index": stages.index(stage) + 1 if stage in stages else 0,
        "published_by": name(register["published_by_user_id"])
        if register["published_by_user_id"]
        else None,
        "inactive_label": _inactive_label(db, risk) if risk["status"] == "inactive" else None,
        "quiet": not archived_on and rules.is_quiet(db, risk, posting),
        "tidak_sesuai": bool(latest and latest["tidak_sesuai"]),
        "recurring": bool(latest and latest["recurring"]),
        "timeline": group(None),
        "mitigations": mitigations,
        "panel": own_cards + prev_cards,
        "previous_url": url(prev_register, prev) if prev and prev_register else None,
        "next_url": url(next_register, nxt) if nxt and next_register else None,
        "archived_on": archived_on,
        "following": rules.is_following(db, uid, risk["id"], register["position_id"], today),
        "always_following": rules.is_always_subscribed(db, uid, register["position_id"], today),
        "participation": participation,
        "posting_quarter": posting,
        "related_quarters": related,
        "blind_warning": bool(
            participation and participation["line"] == 3 and not own_lini3_opened
        ),
        "is_operator_holding": bool(participation and participation["capacity"] == "operator"),
        "storage": {
            "used": rules.storage_used(db, register["position_id"], register["fiscal_year"]),
            "quota": rules.QUOTA_BYTES,
        },
        "viewer_is_holder": register["position_id"] in held,
    }


def thread_since(user: User, risk_id: uuid.UUID, since: str) -> Row:
    """Polling (NFR-015, every 30 s): ids of visible comments by others posted from `since` on
    (minute precision, as the page shows times); the page compares them with what it shows."""
    risk = RegisterRisk.objects.select_related("register").filter(pk=risk_id).first()
    if risk is None or risk.status not in ("active", "inactive"):
        raise ApiError("not_found", "Risiko tidak ditemukan.")
    try:
        start = clock.parse_local(since)
    except ValueError as exc:
        raise ApiError("validation", "Parameter since tidak valid.") from exc
    assert_can_read(user, str(risk.register.position_id), risk.register.fiscal_year_id)
    newer = Comment.objects.filter(
        Q(register_risk=risk)
        & Q(created_at__gte=start)
        & ~Q(author=user)
        & Q(withdrawn_at__isnull=True)
    )
    ids = [str(i) for i in newer.order_by("created_at").values_list("id", flat=True)]
    return {"comments": len(ids), "comment_ids": ids}


def participants(user: User, risk_id: uuid.UUID, quarter_id: str) -> list[Row]:
    """Mention picker (FR-PPN-007) for the thread's position and the comment's quarter."""
    risk = RegisterRisk.objects.select_related("register__position").filter(pk=risk_id).first()
    if risk is None:
        raise ApiError("not_found", "Risiko tidak ditemukan.")
    position = risk.register.position
    assert_can_read(user, str(position.id), risk.register.fiscal_year_id)
    db = board_db(position)
    return rules.thread_participants(
        db, str(position.id), quarter_id, clock.today().isoformat(), str(user.id)
    )


def downloadable(user: User, attachment_id: uuid.UUID) -> Attachment:
    """The attachment when the viewer may read its thread (or assessment) and see the file
    (VIS-3, INV-10); not_found otherwise, so nothing leaks."""
    a = Attachment.objects.filter(pk=attachment_id).first()
    if a is None:
        raise ApiError("not_found", "Lampiran tidak ditemukan.")
    risks = RegisterRisk.objects.select_related("register")
    if a.owner_kind == "comment":
        if Comment.objects.filter(pk=a.owner_id, withdrawn_at__isnull=False).exists():
            raise ApiError("not_found", "Lampiran tidak ditemukan.")  # VIS-6
        risk = risks.filter(comments__id=a.owner_id).first()
    else:
        risk = risks.filter(quarters__assessments__id=a.owner_id).first()
    if risk is None:
        raise ApiError("not_found", "Lampiran tidak ditemukan.")
    assert_can_read(user, str(risk.register.position_id), risk.register.fiscal_year_id)
    viewer = vis.viewer_for(load_access_db(), str(user.id), clock.today().isoformat())
    row = {
        "is_confidential": a.is_confidential,
    }
    if not vis.can_see_attachment(viewer, row):
        raise ApiError("not_found", "Lampiran tidak ditemukan.")
    if a.owner_kind == "assessment":
        # Assessment evidence follows the assessment's own visibility (VIS-1/2/5/9, INV-16).
        assessment = Assessment.objects.select_related("risk_quarter").get(pk=a.owner_id)
        rq = assessment.risk_quarter
        results = rows(ResultRow, ComparisonResult.objects.filter(risk_quarter=rq))
        at = now_iso()
        opened = {r["lini3_position_id"] for r in results if r["opened_at"][:16] <= at[:16]}
        expected = [
            str(p)
            for p in QuarterAssessor.objects.filter(
                quarter_id=rq.quarter_id, excluded=False
            ).values_list("position_id", flat=True)
        ]
        a_row = {
            "assessor_position_id": str(assessment.assessor_position_id),
            "assessor_line": assessment.assessor_line,
        }
        if not vis.can_see_assessment(viewer, a_row, opened, expected):
            raise ApiError("not_found", "Lampiran tidak ditemukan.")
    return a
