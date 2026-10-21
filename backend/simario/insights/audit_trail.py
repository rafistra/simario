"""The audit trail (FR-ADM-008, VIS-8). Ports buildAudit, redact and labelScores in
frontend/src/data/api/insights.ts: scope by permission 23, filters in SQL, then redaction per
row before anything leaves the server. Original values need permission 24 and are logged."""

import uuid
from typing import Any

from django.db.models import Q
from rest_framework import serializers

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.audit.models import AuditLog
from simario.audit.services import record
from simario.board.models import Attachment
from simario.board.selectors import now_iso
from simario.core import clock
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import assessment as rules
from simario.domain.visibility import REDACTED, REDACTED_FILE
from simario.org.models import Position

Row = dict[str, Any]
# Lini 1 "Belum relevan" and its reason are part of the blind judgement too (VIS-1).
SCORE_KEYS = {"score", "predicate", "note", "notRelevant", "notRelevantReason"}
# Newest first; older rows are reached with the date filters.
MAX_ROWS = 500
_DT = serializers.DateTimeField()


def _scope(user: User, today: str) -> str | None:
    scopes = access.permission_scopes(load_access_db(), str(user.id), today)
    if 23 not in scopes:
        raise ApiError("forbidden", "Anda tidak memiliki akses ke jejak audit.")
    return scopes[23]


def _scoped(user: User, today: str) -> Any:
    scope = _scope(user, today)
    qs = AuditLog.objects.all()
    if scope == "semua":
        return qs
    if scope == "sendiri":
        return qs.filter(actor=user)
    db = load_access_db()
    holdings = access.holdings_of(db, str(user.id), today)
    units = {Position.objects.get(pk=h["position_id"]).org_unit_id for h in holdings} | (
        {user.org_unit_id} if user.org_unit_id else set()
    )
    return qs.filter(Q(acting_position__org_unit_id__in=units) | Q(actor__org_unit_id__in=units))


def _filtered(qs: Any, f: Row) -> Any:
    if f.get("from"):
        qs = qs.filter(at__date__gte=f["from"])
    if f.get("to"):
        qs = qs.filter(at__date__lte=f["to"])
    if f.get("actor"):
        qs = qs.filter(actor_id=f["actor"])
    if f.get("position"):
        qs = qs.filter(acting_position_id=f["position"])
    if f.get("entity_type"):
        qs = qs.filter(entity_type=f["entity_type"])
    if f.get("action"):
        qs = qs.filter(action=f["action"])
    return qs


def _walk(v: Any, blind: bool, confidential: set[str], key: str | None = None) -> Any:
    if blind and key in SCORE_KEYS and v is not None:
        return REDACTED
    if isinstance(v, str):
        return REDACTED_FILE if v in confidential else v
    if isinstance(v, list):
        return [_walk(x, blind, confidential) for x in v]
    if isinstance(v, dict):
        return {k: _walk(x, blind, confidential, k) for k, x in v.items()}
    return v


def _named_confidential(entry: Row) -> set[str]:
    """File names an audit entry itself marks as confidential (evidence upload and removal)."""
    out: set[str] = set()
    for side in (entry.get("before"), entry.get("after")):
        if not isinstance(side, dict):
            continue
        out |= {n for n in side.get("confidentialFiles") or [] if isinstance(n, str)}
        if side.get("confidential") is True and isinstance(side.get("file"), str):
            out.add(side["file"])
    return out


def _page_db(assessment_ids: set[str]) -> Row:
    """The rows `assessment_frozen` and option labels need for these assessments only."""
    from simario.assessments.models import Assessment, ComparisonResult
    from simario.board.serializers import AssessmentRow, ResultRow, rows
    from simario.core.collections import COLLECTIONS

    ids = []
    for i in assessment_ids:
        try:
            ids.append(uuid.UUID(i))
        except ValueError:
            continue
    assessments = rows(AssessmentRow, Assessment.objects.filter(pk__in=ids))
    rq_ids = {a["risk_quarter_id"] for a in assessments}
    qs, serializer = COLLECTIONS["scoreOptions"]
    return {
        "assessments": assessments,
        "by_id": {a["id"]: a for a in assessments},
        "results": rows(ResultRow, ComparisonResult.objects.filter(risk_quarter_id__in=rq_ids)),
        "score_options": rows(serializer, qs()),
    }


def _label_scores(db: Row, entry: Row) -> Row:
    """PRD v2.8: numbers in Assessment before/after read as the chosen statement."""
    if entry["entity_type"] != "Assessment":
        return entry
    a = db["by_id"].get(entry["entity_id"])
    version = a["score_band_version_id"] if a else None

    def swap(v: Any) -> Any:
        if not isinstance(v, dict) or not isinstance(v.get("score"), int | float):
            return v
        if isinstance(v["score"], bool):
            return v
        return {**v, "score": rules.option_label_of(db, version, v["score"]) or v["score"]}

    return {**entry, "before": swap(entry["before"]), "after": swap(entry["after"])}


def build_audit(user: User, f: Row, original: bool) -> list[Row]:
    at = now_iso()
    today = at[:10]
    if original:
        if not access.has_permission(load_access_db(), str(user.id), 24, today):
            raise ApiError("forbidden", "Menampilkan nilai asli memerlukan izin khusus.")
        # Logged on the read itself, so no client can show original values unrecorded.
        log_show_original(user)
    qs = (
        _filtered(_scoped(user, today), f)
        .select_related("actor", "acting_position")
        .order_by("-at")
    )
    entries = list(qs[:MAX_ROWS])
    assessment_ids = {e.entity_id for e in entries if e.entity_type == "Assessment"}
    db = _page_db(assessment_ids)
    confidential: set[str] | None = None
    if not original and not access.has_permission(load_access_db(), str(user.id), 10, today):
        confidential = set(
            Attachment.objects.filter(is_confidential=True).values_list("filename", flat=True)
        )
        # Names recorded as confidential when written, also for files removed since.
        for e in entries:
            confidential |= _named_confidential({"before": e.before, "after": e.after})
    out = []
    for e in entries:
        row: Row = {
            "id": str(e.id),
            "at": _DT.to_representation(e.at),
            "actor_user_id": str(e.actor_id) if e.actor_id else None,
            "acting_as": e.acting_as,
            "acting_position_id": str(e.acting_position_id) if e.acting_position_id else None,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "before": e.before,
            "after": e.after,
        }
        if not original:
            a = db["by_id"].get(e.entity_id) if e.entity_type == "Assessment" else None
            blind = a is not None and not rules.assessment_frozen(db, a, at)
            hidden = confidential | _named_confidential(row) if confidential is not None else set()
            row["before"] = _walk(row["before"], blind, hidden)
            row["after"] = _walk(row["after"], blind, hidden)
            row = _label_scores(db, row)
        row["actor_name"] = e.actor.full_name if e.actor else "Sistem"
        row["position_name"] = e.acting_position.name if e.acting_position else "—"
        out.append(row)
    return out


def facets(user: User) -> Row:
    """Filter choices for the audit page, within the viewer's scope."""
    qs = _scoped(user, now_iso()[:10])
    return {
        "actions": sorted(set(qs.values_list("action", flat=True))),
        "entity_types": sorted(set(qs.values_list("entity_type", flat=True))),
    }


def log_show_original(user: User) -> None:
    """FR-ADM-008: every use of "Tampilkan nilai asli" is logged."""
    today = now_iso()[:10]
    db = load_access_db()
    if not access.has_permission(db, str(user.id), 24, today):
        raise ApiError("forbidden", "Anda tidak memiliki izin untuk tindakan ini.")
    record(
        action="tampilkan_nilai_asli",
        entity_type="AuditLog",
        entity_id="*",
        actor=user,
        acting_as="superadmin",
        at=clock.now(),
    )
