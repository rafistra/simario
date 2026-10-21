"""Printing, freezing and photo selection (PRD ch. 9, FR-LBR-005/006/009). Ports sheetApi and
runSheetFreeze in frontend/src/data/api/sheets.ts. Snapshots are created and never changed
(INV-22): only `superseded_by` of the previous automatic version is set when a new one exists.
Numbering is serialised per position (row lock) and guarded by a unique constraint."""

import datetime as dt
import json
import uuid
from typing import Any

from django.db import transaction
from rest_framework import serializers

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.assessments.selectors import Db
from simario.audit.services import record
from simario.board.models import Attachment, Comment
from simario.board.selectors import now_iso
from simario.calendar.models import FiscalYear
from simario.calendar.services import on_archive
from simario.core import clock, scheduler
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import sheet_payload as rules
from simario.domain.assessment import quarter_risks
from simario.org.models import Position
from simario.registers.selectors import assert_can_read

from .models import PrintSnapshot, SheetPhotoSelection
from .selectors import _quarter, build_payload, latest_auto, sheet_db

Row = dict[str, Any]
MAX_PHOTOS = 5
LINE_OF_SECTION = {"A": 1, "B": 2, "C": 3}
_DT = serializers.DateTimeField()


def _create(
    db: Db,
    kind: str,
    position_id: str,
    quarter: Row,
    payload: Row,
    trigger: str,
    user: User | None,
    at: dt.datetime,
) -> PrintSnapshot:
    auto = latest_auto(position_id, quarter["id"], kind)
    if trigger == "print":
        version = auto.version if auto else None
    else:
        version = (auto.version or 0) + 1 if auto else 1
    prefix = rules.snapshot_prefix(db, kind, position_id, quarter)
    seq = PrintSnapshot.objects.filter(number__startswith=prefix).count() + 1
    snap = PrintSnapshot.objects.create(
        number=f"{prefix}{seq:03d}",
        position_id=position_id,
        quarter_id=quarter["id"],
        kind=kind,
        version=version,
        trigger=trigger,
        is_provisional=trigger == "print" and auto is None,
        payload=payload,
        created_by=user,
        created_at=at,
    )
    if trigger != "print" and auto is not None:
        auto.superseded_by = snap
        auto.save(update_fields=["superseded_by"])
    record(
        action="cetak_lembar" if trigger == "print" else "bekukan_lembar",
        entity_type="PrintSnapshot",
        entity_id=str(snap.id),
        actor=user,
        acting_as=None if user else "sistem",
        after={"number": snap.number, "version": version, "trigger": trigger},
        at=at,
    )
    return snap


def _lock_position(position_id: Any) -> None:
    Position.objects.select_for_update().filter(pk=position_id).first()


@transaction.atomic
def print_sheets(
    user: User, position_id: uuid.UUID, fiscal_year: int, tw: int, kinds: list[str]
) -> list[str]:
    """FR-LBR-006: printing the live view creates snapshots first; returns them to print
    from. Printing follows permission 1 (FR-ADM-002), so it needs the same read access."""
    pid = str(position_id)
    assert_can_read(user, pid, fiscal_year)
    _lock_position(pid)
    at = clock.now()
    db = sheet_db(position_id)
    q = _quarter(db, fiscal_year, tw)
    payload = build_payload(db, pid, q, now_iso())
    return [str(_create(db, k, pid, q, payload, "print", user, at).id) for k in kinds]


def _allowed_photos(position_id: str, quarter_id: str, line: int) -> set[str]:
    """Clean, non-confidential images on this position's comments of that quarter and line."""
    comments = Comment.objects.filter(
        register_risk__register__position_id=position_id,
        quarter_id=quarter_id,
        author_line=line,
        withdrawn_at__isnull=True,
    ).values("id")
    return {
        str(i)
        for i in Attachment.objects.filter(
            owner_kind="comment",
            owner_id__in=comments,
            scan_status="clean",
            is_confidential=False,
            mime_type__startswith="image/",
        ).values_list("id", flat=True)
    }


@transaction.atomic
def set_photos(
    user: User, position_id: Any, quarter_id: Any, section: str, attachment_ids: list[str]
) -> None:
    """FR-LBR-005: participants of that line choose up to 5 images per section."""
    if section not in LINE_OF_SECTION:
        raise ApiError("not_found", "Bagian lembar tidak dikenal.")
    if len(attachment_ids) > MAX_PHOTOS:
        raise ApiError("validation", "Maksimal 5 foto per bagian")
    line = LINE_OF_SECTION[section]
    today = now_iso()[:10]
    h = access.participation_holding(
        load_access_db(), str(user.id), str(position_id), str(quarter_id), today
    )
    if h is None or h["line"] != line:
        raise ApiError("forbidden", f"Foto Bagian {section} dipilih oleh peserta Lini {line}.")
    ids = [str(i) for i in attachment_ids]
    if not set(ids) <= _allowed_photos(str(position_id), str(quarter_id), line):
        raise ApiError(
            "validation", f"Foto Bagian {section} harus gambar dari utas Lini {line} triwulan ini."
        )
    SheetPhotoSelection.objects.update_or_create(
        position_id=position_id,
        quarter_id=quarter_id,
        section=section,
        defaults={"attachment_ids": ids},
    )
    record(
        action="pilih_foto_lembar",
        entity_type="Quarter",
        entity_id=str(quarter_id),
        actor=user,
        acting_as=h["capacity"],
        acting_position=Position.objects.get(pk=h["position_id"]),
        after={"section": section, "attachmentIds": ids},
        at=clock.now(),
    )


def _stripped(payload: Row) -> str:
    return json.dumps({**payload, "built_at": ""}, sort_keys=True, default=str)


def _freeze(
    as_of: dt.datetime, years: set[int], trigger: str, positions: set[str] | None = None
) -> int:
    at_iso = _iso(as_of)
    today = at_iso[:10]
    made = 0
    # Lock the positions first, so the "content changed" check reads committed state and two
    # triggers on one position cannot both freeze stale content.
    targets = Position.objects.filter(position_type__line=1)
    if positions is not None:
        targets = targets.filter(pk__in=list(positions))
    list(targets.select_for_update(of=("self",)).order_by("pk").values_list("id", flat=True))
    # One position (an event trigger) loads only its rows; the scheduled run loads all.
    only = next(iter(positions)) if positions and len(positions) == 1 else None
    db = sheet_db(only)
    lini1_types = {t["id"] for t in db["position_types"] if t["line"] == 1}
    lini1 = [
        p
        for p in db["positions"]
        if p["position_type_id"] in lini1_types and (positions is None or p["id"] in positions)
    ]
    for q in db["quarters"]:
        if q["fiscal_year"] not in years or q["lini3_opens_on"] > today:
            continue
        for p in lini1:
            if trigger == "auto_freeze" and not rules.freeze_ready(db, p["id"], q, at_iso):
                continue
            if trigger == "archive" and not quarter_risks(db, p["id"], q):
                continue
            payload = build_payload(db, p["id"], q, at_iso)
            last = latest_auto(p["id"], q["id"], "komunikasi")
            if last is not None and _stripped(last.payload) == _stripped(payload):
                continue
            for kind in ("komunikasi", "mutu"):
                _create(db, kind, p["id"], q, payload, trigger, None, as_of)
            made += 1
    return made


def _iso(at: dt.datetime) -> str:
    return str(_DT.to_representation(at))


@scheduler.register("sheet_freeze")
def scheduled_freeze(as_of: dt.datetime) -> None:
    run_sheet_freeze(as_of)


@transaction.atomic
def run_sheet_freeze(as_of: dt.datetime, positions: set[str] | None = None) -> None:
    """FR-LBR-009: freeze each position-quarter automatically once ready; a new version whenever
    the content changed since the last automatic one. Archived years are left untouched."""
    years = set(FiscalYear.objects.exclude(status="archived").values_list("year", flat=True))
    _freeze(as_of, years, "auto_freeze", positions)


@on_archive
def archive_versions(fy: Any, at: dt.datetime) -> None:
    """§2.5 / FR-LBR-009: a final `archive` version where the content changed since the last."""
    _freeze(at, {fy.year}, "archive")
