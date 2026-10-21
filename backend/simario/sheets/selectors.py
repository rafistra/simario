"""Sheet read model (PRD ch. 9, FR-LBR-001 … 010). Ports buildSheetView in
frontend/src/data/api/sheets.ts: the payload is reader-neutral (VIS-7); masking for a late
directorate (VIS-9) is applied here per viewer, also on frozen copies."""

import uuid
from typing import Any

from rest_framework import serializers

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.assessments.selectors import Db, assessment_db
from simario.board.models import Attachment
from simario.board.selectors import now_iso
from simario.board.serializers import AttachmentRow, rows
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import sheet_payload as rules
from simario.registers.selectors import assert_can_read

from .models import PrintSnapshot, SheetPhotoSelection

Row = dict[str, Any]
_DT = serializers.DateTimeField()


def sheet_db(position_id: Any) -> Db:
    """The assessment rows of one position (all when None) plus their comment attachments
    (photos, file names)."""
    db = assessment_db(None if position_id is None else [position_id])
    comment_ids = [c["id"] for c in db["comments"]]
    db["attachments"] = db["attachments"] + rows(
        AttachmentRow, Attachment.objects.filter(owner_kind="comment", owner_id__in=comment_ids)
    )
    return db


def photo_selection(position_id: Any, quarter_id: Any) -> dict[str, list[str]]:
    return {
        s.section: [str(x) for x in s.attachment_ids]
        for s in SheetPhotoSelection.objects.filter(position_id=position_id, quarter_id=quarter_id)
    }


def build_payload(db: Db, position_id: str, quarter: Row, at: str) -> Row:
    return rules.build_sheet_payload(
        db, position_id, quarter, at, photo_selection(position_id, quarter["id"])
    )


def _info(s: PrintSnapshot) -> Row:
    nxt = s.superseded_by
    return {
        "id": str(s.id),
        "number": s.number,
        "kind": s.kind,
        "version": s.version,
        "trigger": s.trigger,
        "is_provisional": s.is_provisional,
        "superseded_by_version": nxt.version if nxt else None,
        "created_by": s.created_by.full_name if s.created_by else "Sistem",
        "created_at": _DT.to_representation(s.created_at),
    }


def latest_auto(position_id: Any, quarter_id: Any, kind: str) -> PrintSnapshot | None:
    return (
        PrintSnapshot.objects.filter(position_id=position_id, quarter_id=quarter_id, kind=kind)
        .exclude(trigger="print")
        .order_by("-version")
        .first()
    )


def _quarter(db: Db, fiscal_year: int, tw: int) -> Row:
    q = next(
        (x for x in db["quarters"] if x["fiscal_year"] == fiscal_year and x["number"] == tw), None
    )
    if q is None:
        raise ApiError("not_found", f"Triwulan TW {tw} TA {fiscal_year} tidak ditemukan.")
    found: Row = q
    return found


def build_sheet_view(
    user: User, position_id: uuid.UUID, fiscal_year: int, tw: int, snapshot_id: str | None
) -> Row:
    at = now_iso()
    today = at[:10]
    pid = str(position_id)
    uid = str(user.id)
    db = sheet_db(position_id)
    quarter = _quarter(db, fiscal_year, tw)
    assert_can_read(user, pid, fiscal_year)
    register = next(
        (r for r in db["registers"] if r["position_id"] == pid and r["fiscal_year"] == fiscal_year),
        None,
    )
    published = bool(
        register
        and (register["status"] in ("published", "archived") or register.get("published_at"))
    )
    snap = None
    if snapshot_id:
        try:
            snap = (
                PrintSnapshot.objects.select_related("superseded_by", "created_by")
                .filter(pk=uuid.UUID(str(snapshot_id)), position_id=position_id)
                .first()
            )
        except ValueError:
            snap = None
        if snap is None:
            raise ApiError("not_found", "Salinan beku tidak ditemukan.")
    neutral = snap.payload if snap else build_payload(db, pid, quarter, at)
    lini3 = [h["position_id"] for h in access.holdings_of(db, uid, today) if h["line"] == 3]
    payload, masked = rules.mask_payload_for(neutral, lini3)
    holding = access.participation_holding(db, uid, pid, quarter["id"], today)
    fy = next((f for f in db["fiscal_years"] if f["year"] == fiscal_year), None)
    archived = bool(fy and fy["status"] == "archived")
    latest = latest_auto(position_id, quarter["id"], "komunikasi")
    snapshots = PrintSnapshot.objects.select_related("superseded_by", "created_by").filter(
        position_id=position_id, quarter_id=quarter["id"]
    )
    return {
        "quarter": quarter,
        "quarters": sorted(
            (q for q in db["quarters"] if q["fiscal_year"] == fiscal_year),
            key=lambda q: q["number"],
        ),
        "payload": payload,
        "masked": masked,
        "snapshot": _info(snap) if snap else None,
        "snapshots": [_info(s) for s in snapshots.order_by("-created_at")],
        "latest_version": latest.version if latest else None,
        "can_pick": {
            sec: not archived and bool(holding and holding["line"] == line)
            for sec, line in (("A", 1), ("B", 2), ("C", 3))
        },
        "published": published,
    }


def find_by_number(user: User, number: str) -> Row:
    """FR-LBR-010: a number outside the viewer's scope reads as unknown."""
    wanted = number.strip()
    s = PrintSnapshot.objects.select_related("quarter").filter(number__iexact=wanted).first()
    today = now_iso()[:10]
    if s is None or not access.can_read_position(
        load_access_db(), str(user.id), str(s.position_id), today, s.quarter.fiscal_year_id
    ):
        raise ApiError("not_found", f'Nomor cetak "{wanted}" tidak ditemukan.')
    return {
        "id": str(s.id),
        "position_id": str(s.position_id),
        "fiscal_year": s.quarter.fiscal_year_id,
        "tw": s.quarter.number,
        "kind": s.kind,
    }
