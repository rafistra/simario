"""Fiscal years, quarters, Lini 3 exclusion and archiving (PRD §2.5, FR-ADM-007, INV-9, INV-21).
Ports calendarApi, archiveStatus and runCalendar in frontend/src/data/api/calendar.ts: same
checks, error copy and audit actions. Archive side effects of other modules register through
`on_archive` (registers B3, assessments B5, sheets B7)."""

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

from django.db import transaction

from simario.assessments import usage
from simario.audit.services import record, record_by
from simario.core.errors import ApiError
from simario.core.format import format_date
from simario.core.permissions import Actor
from simario.domain.calendar import default_quarters, quarter_problems
from simario.org.models import Position

from .models import FiscalYear, Quarter, QuarterAssessor

ArchiveHook = Callable[[FiscalYear, dt.datetime], None]
_ARCHIVE_HOOKS: list[ArchiveHook] = []

QUARTER_FIELDS = (
    "starts_on",
    "ends_on",
    "lini1_opens_on",
    "lini1_deadline",
    "lini3_opens_on",
    "lini3_deadline",
    "explanation_workdays",
)
ARCHIVED = "Tahun anggaran ini sudah diarsipkan."


def on_archive(fn: ArchiveHook) -> ArchiveHook:
    """Registers an archive side effect; runs inside the archiving transaction."""
    _ARCHIVE_HOOKS.append(fn)
    return fn


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(p.capitalize() for p in rest)


def _row(q: Quarter) -> dict[str, Any]:
    row: dict[str, Any] = {"id": str(q.id), "number": q.number}
    for f in QUARTER_FIELDS:
        value = getattr(q, f)
        row[f] = value.isoformat() if isinstance(value, dt.date) else value
    return row


@transaction.atomic
def create_fiscal_year(actor: Actor, year: int) -> None:
    if FiscalYear.objects.filter(pk=year).exists():
        raise ApiError("validation", f"TA {year} sudah ada.")
    fy = FiscalYear.objects.create(year=year)
    Quarter.objects.bulk_create(Quarter(fiscal_year=fy, **q) for q in default_quarters(year))
    record_by(actor, "buat_tahun_anggaran", "FiscalYear", year, None, {"year": year})


@transaction.atomic
def update_fiscal_year(actor: Actor, year: int, patch: dict[str, int]) -> None:
    if any(v < 0 for v in patch.values()):
        raise ApiError("validation", "Jumlah hari tidak boleh negatif.")
    fy = FiscalYear.objects.select_for_update().get(pk=year)
    if fy.status == "archived":
        raise ApiError("archived", ARCHIVED)
    before = {"toleranceDays": fy.tolerance_days, "archiveGraceDays": fy.archive_grace_days}
    for field, value in patch.items():
        setattr(fy, field, value)
    fy.save()
    record_by(
        actor,
        "ubah_tahun_anggaran",
        "FiscalYear",
        year,
        before,
        {_camel(k): v for k, v in patch.items()},
    )


@transaction.atomic
def update_quarter(
    actor: Actor, quarter_id: uuid.UUID, patch: dict[str, Any], confirm_past_deadline: bool
) -> None:
    """FR-ADM-007: INV-9; windows cannot move past entered scores; passed deadlines need
    confirmation."""
    q = Quarter.objects.select_for_update().select_related("fiscal_year").get(pk=quarter_id)
    if q.fiscal_year.status == "archived":
        raise ApiError("archived", ARCHIVED)
    patch = {k: (v.isoformat() if isinstance(v, dt.date) else v) for k, v in patch.items()}
    current = _row(q)
    nxt = {**current, **patch}
    rows = [
        nxt if str(x.id) == str(q.id) else _row(x)
        for x in Quarter.objects.filter(fiscal_year=q.fiscal_year)
    ]
    problems = quarter_problems(q.fiscal_year_id, rows)
    if problems:
        raise ApiError("inv9", problems[0]["message"], problems)
    for line in (1, 3):
        field = f"lini{line}_opens_on"
        if nxt[field] > current[field]:
            affected = usage.entered_before(q.id, line, dt.date.fromisoformat(nxt[field]))
            if affected:
                raise ApiError(
                    "window",
                    f"Jendela Lini {line} tidak dapat dimundurkan: {affected} penilaian sudah "
                    "diisi sebelum tanggal itu.",
                )
    passed = [
        f
        for f in ("lini1_deadline", "lini3_deadline")
        if f in patch and patch[f] != current[f] and current[f] < actor.today
    ]
    if passed and not confirm_past_deadline:
        raise ApiError(
            "confirm",
            "Tenggat ini sudah lewat. Keterlambatan yang sudah tercatat tidak dihitung ulang.",
        )
    before = {_camel(k): current[k] for k in patch}
    for field, value in patch.items():
        setattr(q, field, value)
    q.save()
    record_by(
        actor, "ubah_triwulan", "Quarter", q.id, before, {_camel(k): v for k, v in patch.items()}
    )


@transaction.atomic
def exclude_assessor(
    actor: Actor, quarter_id: uuid.UUID, position_id: uuid.UUID, reason: str
) -> None:
    """§2.5: exclude a Lini 3 position while it has finalised nothing in the quarter."""
    if not reason.strip():
        raise ApiError("validation", "Alasan pengecualian wajib diisi.")
    if usage.assessor_has_finalised(quarter_id, position_id):
        raise ApiError(
            "validation",
            "Direktorat ini sudah menuntaskan penilaian pada triwulan ini dan tidak dapat "
            "dikecualikan.",
        )
    row = (
        QuarterAssessor.objects.select_for_update()
        .filter(quarter_id=quarter_id, position_id=position_id)
        .first()
    )
    if row is None:
        raise ApiError("validation", "Direktorat ini bukan penilai triwulan ini.")
    row.excluded = True
    row.exclusion_reason = reason.strip()
    row.excluded_by = actor.user
    row.save(update_fields=["excluded", "exclusion_reason", "excluded_by"])
    usage.drop_assessor(quarter_id, position_id, actor.at)
    record_by(
        actor,
        "kecualikan_penilai",
        "QuarterAssessor",
        row.pk,
        None,
        {"quarterId": str(quarter_id), "positionId": str(position_id), "reason": reason.strip()},
    )


def archive_status(year: int, today: dt.date) -> dict[str, Any]:
    """§2.5 archiving conditions and the projected (extended) hard limit."""
    fy = FiscalYear.objects.get(pk=year)
    tw4 = Quarter.objects.get(fiscal_year=fy, number=4)
    base = tw4.lini3_deadline + dt.timedelta(days=fy.tolerance_days + fy.archive_grace_days)
    tolerance = dt.timedelta(days=fy.tolerance_days)
    projected = base
    pending = 0
    for due in usage.explanation_due_dates(year):
        limit = due + tolerance
        if today <= limit:
            pending += 1
        if due <= base and limit > projected:
            projected = limit
    blockers = []
    if open_ := usage.tw4_not_fully_open(year):
        blockers.append(f"{open_} risiko TW IV belum terbuka penuh perbandingannya")
    if pending:
        blockers.append(f"{pending} penjelasan wajib belum dikirim dan masih dalam tenggat")
    if today <= tw4.ends_on:
        blockers.append(f"TW IV berakhir {format_date(tw4.ends_on)}")
    return {
        "year": year,
        "status": fy.status,
        "tw4_complete": not blockers,
        "blockers": blockers,
        "base_hard_limit": base,
        "projected": projected,
    }


def archive_year(year: int, at: dt.datetime, by: str, actor: Actor | None) -> None:
    """Archive a fiscal year (§2.5); call inside a transaction. Module hooks close assessments,
    explanations, sheet versions and registers; the year then becomes read-only."""
    fy = FiscalYear.objects.select_for_update().get(pk=year)
    for hook in list(_ARCHIVE_HOOKS):
        hook(fy, at)
    before = {"status": fy.status}
    fy.status = "archived"
    fy.archived_at = at
    fy.archived_by = by
    fy.save(update_fields=["status", "archived_at", "archived_by"])
    after = {"status": "archived", "by": by}
    if actor:
        record_by(actor, "arsipkan_tahun_anggaran", "FiscalYear", year, before, after)
    else:
        record(
            action="arsipkan_tahun_anggaran",
            entity_type="FiscalYear",
            entity_id=str(year),
            acting_as="sistem",
            before=before,
            after=after,
            at=at,
        )


@transaction.atomic
def archive_manually(actor: Actor, year: int) -> None:
    status = archive_status(year, dt.date.fromisoformat(actor.today))
    if status["status"] == "archived":
        raise ApiError("archived", ARCHIVED)
    if not status["tw4_complete"]:
        raise ApiError(
            "blocked",
            f"TW IV belum lengkap: {'; '.join(status['blockers'])}.",
            status["blockers"],
        )
    archive_year(year, actor.at, "manual", actor)


def run_calendar(at: dt.datetime) -> None:
    """Scheduled (§2.5): year status, expected Lini 3 sets, and archiving at the hard limit."""
    today = at.date()
    for fy in FiscalYear.objects.exclude(status="archived"):
        tw4 = Quarter.objects.filter(fiscal_year=fy, number=4).first()
        if tw4 is None:
            continue
        if fy.status == "open" and today > tw4.ends_on:
            fy.status = "closing"
            fy.save(update_fields=["status"])
        if fy.status == "closing" and today > archive_status(fy.year, today)["projected"]:
            archive_year(fy.year, at, "hard_limit", None)
    # Expected Lini 3 set recorded when lini3_opens_on arrives.
    lini3 = list(Position.objects.filter(active=True, position_type__line=3))
    due = (
        Quarter.objects.filter(lini3_opens_on__lte=today, assessors__isnull=True)
        .exclude(fiscal_year__status="archived")
        .distinct()
    )
    for q in due:
        QuarterAssessor.objects.bulk_create(QuarterAssessor(quarter=q, position=p) for p in lini3)
