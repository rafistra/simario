"""Quarterly assessment (PRD ch. 7, FR-NIL-001 … 012). Ports assessmentApi in
frontend/src/data/api/assessment.ts: drafting needs permission 4 (Lini 1) or 8 (Lini 3) on the
assessor position; finalising, reopening and sending need 5 / 9 as Pejabat (INV-12). Every write
locks the RiskQuarter rows it touches, so two assessors finalising at once open each comparison
once."""

import datetime as dt
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from django.db import transaction

from simario.accounts.models import User
from simario.audit.services import record
from simario.board import files
from simario.board.models import Attachment
from simario.board.selectors import now_iso
from simario.board.services import Stored, Upload, check_files, storage_used
from simario.core import clock
from simario.core.errors import ApiError
from simario.core.format import format_date
from simario.domain import access
from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.domain.score_options import _tenths
from simario.notifications.services import notify
from simario.org.models import Position
from simario.registers.selectors import permission_rows

from . import comparisons
from .models import Assessment, ComparisonResult, RiskQuarter
from .selectors import Db, assessment_db, finalise_candidates, finalise_preview_of, line_of

log = logging.getLogger(__name__)
Row = dict[str, Any]

FORBIDDEN = {
    "permission": "Anda tidak memiliki izin untuk tindakan ini.",
    "holding": "Tindakan ini hanya untuk pemegang jabatan penilai.",
    "official": "Tindakan akhir dilakukan oleh Pejabat.",
    "filler": "Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun penilaian ini.",
}
FINAL = "Penilaian ini sudah dituntaskan. Pejabat dapat membukanya kembali."
GAPS = "Alasan/Kendala dan Rencana Tindak Lanjut wajib diisi."


@dataclass(frozen=True)
class Actor:
    user: User
    at: dt.datetime
    at_iso: str
    today: str
    holding: Row


def _actor(user: User, db: Db, code: int, assessor_position_id: str) -> Actor:
    at_iso = now_iso()
    today = at_iso[:10]
    res = access.check_action(
        db, permission_rows(), str(user.id), code, assessor_position_id, today
    )
    if not res["ok"]:
        raise ApiError("forbidden", FORBIDDEN[res["reason"]])
    return Actor(user, clock.now(), at_iso, today, res["holding"])


def _audit(
    a: Actor, action: str, entity_type: str, entity_id: Any, before: Any, after: Any
) -> None:
    record(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        actor=a.user,
        acting_as=a.holding["capacity"],
        acting_position=Position.objects.get(pk=a.holding["position_id"]),
        before=before,
        after=after,
        at=a.at,
    )


def _find(items: list[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _lini1_of_rq(rq_id: Any) -> RiskQuarter:
    rq = (
        RiskQuarter.objects.select_related("register_risk__register", "quarter")
        .filter(pk=rq_id)
        .first()
    )
    if rq is None:
        raise ApiError("not_found", "Risiko triwulan tidak ditemukan.")
    return rq


def _context(db: Db, rq_id: str) -> tuple[Row, Row, Row, Row]:
    rq = _find(db["risk_quarters"], "id", rq_id)
    if rq is None:
        raise ApiError("not_found", "Risiko triwulan tidak ditemukan.")
    q = _find(db["quarters"], "id", rq["quarter_id"])
    risk = _find(db["risks"], "id", rq["register_risk_id"])
    assert q is not None and risk is not None
    reg = _find(db["registers"], "id", risk["register_id"])
    assert reg is not None
    fy = _find(db["fiscal_years"], "year", q["fiscal_year"])
    if fy and fy["status"] == "archived":
        raise ApiError(
            "archived", "Tahun anggaran ini sudah diarsipkan. Penilaian hanya dapat dibaca."
        )
    return rq, q, risk, reg


def _window_error(q: Row, line: int) -> ApiError:
    roman = rules.ROMAN[q["number"] - 1]
    opens = dt.date.fromisoformat(rules.window_opens_on(q, line))
    return ApiError("window", f"Penilaian TW {roman} dibuka mulai {format_date(opens)}.")


def _assert_writable(db: Db, rq_id: str, assessor_position_id: str, at_iso: str) -> tuple[Row, int]:
    _, q, _, reg = _context(db, rq_id)
    line = line_of(db, assessor_position_id)
    if line == 1 and assessor_position_id != reg["position_id"]:
        # Lini 1 assesses only its own position's risks.
        raise ApiError("forbidden", FORBIDDEN["holding"])
    if not rules.window_open(q, line, at_iso[:10]):
        raise _window_error(q, line)
    if line == 3 and assessor_position_id not in board_rules.expected_lini3(db, q["id"]):
        raise ApiError("excluded", "Direktorat ini dikecualikan dari penilaian triwulan ini.")
    probe = {
        "risk_quarter_id": rq_id,
        "assessor_line": line,
        "assessor_position_id": assessor_position_id,
    }
    if rules.assessment_frozen(db, probe, at_iso):
        raise ApiError(
            "frozen", "Perbandingan risiko ini sudah dibuka; penilaian tidak dapat diubah."
        )
    return q, line


def _existing(db: Db, rq_id: str, assessor_position_id: str) -> Row | None:
    return next(
        (
            x
            for x in db["assessments"]
            if x["risk_quarter_id"] == rq_id and x["assessor_position_id"] == assessor_position_id
        ),
        None,
    )


def _ensure(db: Db, rq_id: str, position_id: str, line: int, q: Row, at: dt.datetime) -> Assessment:
    a, _ = Assessment.objects.get_or_create(
        risk_quarter_id=uuid.UUID(rq_id),
        assessor_position_id=uuid.UUID(position_id),
        defaults={
            "assessor_line": line,
            "status": "draft",
            "score_band_version_id": rules.band_version_for(db, q),
            "updated_at": at,
        },
    )
    return a


def _position_of(rq_id: Any) -> str:
    return str(_lini1_of_rq(rq_id).register_risk.register.position_id)


def _lock(rq_ids: list[Any]) -> None:
    list(RiskQuarter.objects.select_for_update().filter(pk__in=rq_ids).order_by("pk"))


# ---------- Cells ----------


@transaction.atomic
def save_cell(user: User, rq_id: Any, assessor_position_id: Any, patch: Row) -> None:
    """Autosave of the viewer's own cell (FR-NIL-002, 005). Editing a ready row returns it to
    draft."""
    rq_id, pos = str(rq_id), str(assessor_position_id)
    _lock([rq_id])
    db = assessment_db([_position_of(rq_id)])
    line = line_of(db, pos)
    a = _actor(user, db, 4 if line == 1 else 8, pos)
    q, _ = _assert_writable(db, rq_id, pos, a.at_iso)
    score = patch.get("score")
    if score is not None and not any(
        _tenths(o["value"]) == _tenths(score)
        for o in rules.options_of(db, rules.band_version_for(db, q))
    ):
        raise ApiError("validation", "Pilihan penilaian tidak dikenal.")
    if line == 3 and patch.get("not_relevant"):
        raise ApiError("validation", '"Belum relevan" tidak tersedia untuk Lini 3.')
    if line == 1 and "note" in patch:
        raise ApiError("validation", "Catatan penilaian hanya untuk Lini 3.")
    existing = _existing(db, rq_id, pos)
    if existing and existing["status"] == "final":
        raise ApiError("final", FINAL)
    x = _ensure(db, rq_id, pos, line, q, a.at)
    before = {
        "score": None if x.score is None else float(x.score),
        "notRelevant": x.not_relevant,
        "notRelevantReason": x.not_relevant_reason,
        "note": x.note,
    }
    if "score" in patch:
        x.score = None if score is None else round(float(score), 1)
    if "not_relevant" in patch:
        x.not_relevant = bool(patch["not_relevant"])
        if x.not_relevant:
            x.score = None
        else:
            x.not_relevant_reason = None
    if "not_relevant_reason" in patch:
        x.not_relevant_reason = patch["not_relevant_reason"]
    if "note" in patch:
        x.note = patch["note"] if (patch["note"] or "").strip() else None
    x.predicate = rules.predicate_in(db, q, None if x.score is None else float(x.score))
    x.updated_at = a.at
    if x.status == "ready":
        x.status = "draft"
    x.save()
    after = {_camel(k): v for k, v in patch.items()}
    _audit(a, "simpan_draf_penilaian", "Assessment", x.id, before, after)


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(w.title() for w in rest)


def add_files(user: User, rq_id: Any, assessor_position_id: Any, uploads: list[Upload]) -> None:
    """Evidence files (FR-NIL-002): stored before the transaction, removed again when refused.
    Lini 3 files are confidential unless unticked (VIS-4)."""
    mimes = check_files(uploads)
    rq = _lini1_of_rq(rq_id)
    register = rq.register_risk.register
    stored = []
    try:
        for f, mime in zip(uploads, mimes, strict=True):
            aid = uuid.uuid4()
            key = files.key_for(register.position_id, register.fiscal_year_id, aid)
            files.put(key, f.data, mime)
            stored.append(Stored(aid, key, mime, f))
        _add_files(user, str(rq_id), str(assessor_position_id), stored)
    except BaseException:
        for item in stored:
            try:
                files.delete(item.key)
            except Exception:
                log.exception("could not remove %s after a refused upload", item.key)
        raise


@transaction.atomic
def _add_files(user: User, rq_id: str, pos: str, stored: list[Stored]) -> None:
    _lock([rq_id])
    rq = _lini1_of_rq(rq_id)
    register = rq.register_risk.register
    db = assessment_db([register.position_id])
    line = line_of(db, pos)
    a = _actor(user, db, 4 if line == 1 else 8, pos)
    q, _ = _assert_writable(db, rq_id, pos, a.at_iso)
    existing = _existing(db, rq_id, pos)
    if existing and existing["status"] == "final":
        raise ApiError("final", FINAL)
    count = (
        Attachment.objects.filter(owner_kind="assessment", owner_id=existing["id"]).count()
        if existing
        else 0
    )
    if count + len(stored) > board_rules.MAX_FILES:
        raise ApiError("validation", f"Maksimal {board_rules.MAX_FILES} berkas per penilaian.")
    incoming = sum(len(s.upload.data) for s in stored)
    if storage_used(register.position_id, register.fiscal_year_id) + incoming > (
        board_rules.QUOTA_BYTES
    ):
        raise ApiError(
            "quota",
            f"Kuota penyimpanan 1 GB untuk jabatan ini pada TA {register.fiscal_year_id} sudah "
            "penuh. Unggahan ditolak.",
        )
    x = _ensure(db, rq_id, pos, line, q, a.at)
    for item in stored:
        Attachment.objects.create(
            id=item.id,
            owner_kind="assessment",
            owner_id=x.id,
            filename=item.upload.name,
            size=len(item.upload.data),
            mime_type=item.mime,
            scan_status="pending",
            # VIS-4: Lini 3 assessment files are confidential by default.
            is_confidential=item.upload.confidential if line == 3 else False,
            uploaded_by=user,
            uploaded_at=a.at,
            object_key=item.key,
        )
    x.updated_at = a.at
    if x.status == "ready":
        x.status = "draft"
    x.save()
    _audit(
        a,
        "lampirkan_bukti_penilaian",
        "Assessment",
        x.id,
        None,
        {
            "files": [s.upload.name for s in stored],
            # Kept so the audit trail can hide these names even after the files are removed.
            "confidentialFiles": [
                s.upload.name for s in stored if line == 3 and s.upload.confidential
            ],
        },
    )
    from simario.board.tasks import scan_attachment

    for item in stored:

        def enqueue(aid: str = str(item.id)) -> None:
            try:
                scan_attachment.delay(aid)
            except Exception:  # broker down: the scheduled sweep scans it later
                log.exception("could not queue the scan of %s", aid)

        transaction.on_commit(enqueue)


def remove_file(user: User, attachment_id: Any) -> None:
    key = _remove_file(user, attachment_id)
    if key:
        try:
            files.delete(key)
        except Exception:
            log.exception("could not remove %s", key)


@transaction.atomic
def _remove_file(user: User, attachment_id: Any) -> str | None:
    f = Attachment.objects.filter(pk=attachment_id, owner_kind="assessment").first()
    if f is None:
        raise ApiError("not_found", "Lampiran tidak ditemukan.")
    x = Assessment.objects.get(pk=f.owner_id)
    _lock([x.risk_quarter_id])
    db = assessment_db([_position_of(x.risk_quarter_id)])
    pos = str(x.assessor_position_id)
    a = _actor(user, db, 4 if x.assessor_line == 1 else 8, pos)
    _assert_writable(db, str(x.risk_quarter_id), pos, a.at_iso)
    if x.status == "final":
        raise ApiError("final", "Penilaian ini sudah dituntaskan.")
    key = f.object_key
    f.delete()
    _audit(
        a,
        "hapus_bukti_penilaian",
        "Assessment",
        x.id,
        {"file": f.filename, "confidential": f.is_confidential},
        None,
    )
    return key


# ---------- Ready, finalise, reopen ----------


def _own_lini1(line: int, assessor_position_id: str, lini1_position_id: str) -> None:
    if line == 1 and assessor_position_id != lini1_position_id:
        raise ApiError("forbidden", FORBIDDEN["holding"])


def _quarter_rqs(lini1_position_id: str, quarter_id: str) -> list[str]:
    return [
        str(i)
        for i in RiskQuarter.objects.filter(
            quarter_id=quarter_id, register_risk__register__position_id=lini1_position_id
        ).values_list("id", flat=True)
    ]


def _notify_position_holders(
    db: Db, position_id: str, text: str, url: str, at: dt.datetime, key: str
) -> None:
    for o in db["occupancies"]:
        if o["position_id"] == position_id and o["is_filler"] and not o["end_date"]:
            notify(
                user=User.objects.get(pk=o["user_id"]),
                kind="ready",
                text=text,
                target_url=url,
                event_key=f"{key}:{o['user_id']}",
                at=at,
            )


@transaction.atomic
def mark_ready(
    user: User, lini1_position_id: Any, quarter_id: Any, assessor_position_id: Any
) -> int:
    """Operator: scored draft rows become ready; the Pejabat is notified."""
    l1, qid, pos = str(lini1_position_id), str(quarter_id), str(assessor_position_id)
    _lock(_quarter_rqs(l1, qid))
    db = assessment_db([l1])
    line = line_of(db, pos)
    _own_lini1(line, pos, l1)
    a = _actor(user, db, 4 if line == 1 else 8, pos)
    q = _find(db["quarters"], "id", qid)
    if q is None:
        raise ApiError("not_found", "Triwulan tidak ditemukan.")
    scored = finalise_candidates(db, l1, q, pos, a.at_iso)["scored"]
    ids = [r["a"]["id"] for r in scored if r["a"]["status"] == "draft"]
    if not ids:
        raise ApiError("nothing", "Tidak ada baris berskor yang perlu ditandai siap.")
    Assessment.objects.filter(pk__in=ids).update(status="ready")
    position = _find(db["positions"], "id", l1)
    assert position is not None
    roman = rules.ROMAN[q["number"] - 1]
    _notify_position_holders(
        db,
        pos,
        f"{user.full_name} menandai penilaian TW {roman} {position['name']} siap untuk Anda "
        "tuntaskan",
        f"/jabatan/{l1}/penilaian/{q['fiscal_year']}/{q['number']}",
        a.at,
        f"assess-ready:{l1}:{qid}:{pos}:{a.at_iso[:16]}",
    )
    _audit(a, "tandai_siap_penilaian", "Quarter", qid, None, {"position": l1, "rows": len(ids)})
    return len(ids)


@transaction.atomic
def finalise(user: User, lini1_position_id: Any, quarter_id: Any, assessor_position_id: Any) -> Row:
    """FR-NIL-003/006: finalises scored rows only; lateness fixed per row; comparisons
    evaluated."""
    l1, qid, pos = str(lini1_position_id), str(quarter_id), str(assessor_position_id)
    _lock(_quarter_rqs(l1, qid))
    db = assessment_db([l1])
    line = line_of(db, pos)
    _own_lini1(line, pos, l1)
    a = _actor(user, db, 5 if line == 1 else 9, pos)
    q = _find(db["quarters"], "id", qid)
    if q is None:
        raise ApiError("not_found", "Triwulan tidak ditemukan.")
    fy = _find(db["fiscal_years"], "year", q["fiscal_year"])
    if fy and fy["status"] == "archived":
        raise ApiError(
            "archived", "Tahun anggaran ini sudah diarsipkan. Penilaian hanya dapat dibaca."
        )
    if not rules.window_open(q, line, a.today):
        raise _window_error(q, line)
    preview = finalise_preview_of(db, l1, q, pos, a.at_iso)
    if preview["missing_reason"]:
        raise ApiError(
            "gaps",
            f'Alasan "Belum relevan" wajib diisi untuk {len(preview["missing_reason"])} risiko.',
            preview["missing_reason"],
        )
    if preview["to_finalise"] == 0:
        raise ApiError("nothing", "Belum ada risiko berskor yang dapat dituntaskan.")
    scored = finalise_candidates(db, l1, q, pos, a.at_iso)["scored"]
    version = rules.band_version_for(db, q)
    with_files = {f["owner_id"] for f in db["attachments"]}
    lateness = rules.finalise_lateness(db, q, line, a.at_iso)
    for r in scored:
        x = Assessment.objects.get(pk=r["a"]["id"])
        x.status = "final"
        x.predicate = rules.predicate_in(db, q, None if x.score is None else float(x.score))
        x.score_band_version_id = version
        x.finalised_by = user
        x.finalised_at = a.at
        x.lateness = lateness
        x.flags = (
            ["no_evidence"]
            if line == 1 and not x.not_relevant and str(x.id) not in with_files
            else []
        )
        x.updated_at = a.at
        x.save()
    _audit(
        a,
        "tuntaskan_penilaian",
        "Quarter",
        qid,
        None,
        {"position": l1, "assessor": pos, "rows": len(scored)},
    )
    comparisons.run_comparisons(a.at, [r["rq"]["id"] for r in scored])
    return preview


@transaction.atomic
def reopen(user: User, assessment_id: Any) -> None:
    """FR-NIL-004/006: per row, while its comparison (Lini 3: own result) has not opened."""
    found = Assessment.objects.filter(pk=assessment_id).first()
    if found is None:
        raise ApiError("not_found", "Penilaian tidak ditemukan.")
    _lock([found.risk_quarter_id])
    x = Assessment.objects.get(pk=assessment_id)
    db = assessment_db([_position_of(x.risk_quarter_id)])
    a = _actor(user, db, 5 if x.assessor_line == 1 else 9, str(x.assessor_position_id))
    _context(db, str(x.risk_quarter_id))
    if x.status != "final":
        raise ApiError("validation", "Penilaian ini belum dituntaskan.")
    row = _find(db["assessments"], "id", str(x.id))
    assert row is not None
    if rules.assessment_frozen(db, row, a.at_iso):
        raise ApiError(
            "frozen",
            "Perbandingan risiko ini sudah dibuka; penilaian tidak dapat dibuka kembali.",
        )
    _audit(
        a,
        "buka_kembali_penilaian",
        "Assessment",
        x.id,
        {"status": "final", "lateness": x.lateness},
        {"status": "draft"},
    )
    x.status = "draft"
    x.finalised_at = None
    x.finalised_by = None
    x.lateness = None
    x.flags = []
    x.updated_at = a.at
    x.save()


# ---------- Explanations (FR-NIL-008) ----------


def _result_context(result_id: Any) -> tuple[ComparisonResult, Db, str]:
    r = ComparisonResult.objects.filter(pk=result_id).first()
    if r is None:
        raise ApiError("not_found", "Hasil perbandingan tidak ditemukan.")
    _lock([r.risk_quarter_id])
    r.refresh_from_db()
    l1 = _position_of(r.risk_quarter_id)
    db = assessment_db([l1])
    _context(db, str(r.risk_quarter_id))
    return r, db, l1


@transaction.atomic
def save_explanation(user: User, result_id: Any, patch: Row) -> None:
    """Lini 1 drafts an explanation per comparison result."""
    r, db, l1 = _result_context(result_id)
    a = _actor(user, db, 4, l1)
    if r.explanation_status == "sent":
        raise ApiError("sent", "Penjelasan yang sudah dikirim tidak dapat diubah.")
    if r.result != "tidak_sesuai":
        raise ApiError("validation", "Penjelasan hanya untuk hasil Tidak Sesuai.")
    before = {"reason": r.explanation_reason, "plan": r.explanation_plan}
    if "reason" in patch:
        r.explanation_reason = patch["reason"]
    if "plan" in patch:
        r.explanation_plan = patch["plan"]
    if r.explanation_status == "ready":
        r.explanation_status = "pending" if r.explanation_required else "optional"
    r.save()
    _audit(a, "ubah_draf_penjelasan", "ComparisonResult", r.id, before, patch)


def _results_of(l1: str, result_ids: list[Any]) -> list[ComparisonResult]:
    rs = list(
        ComparisonResult.objects.select_for_update()
        .filter(pk__in=result_ids, risk_quarter__register_risk__register__position_id=l1)
        .order_by("pk")
    )
    return rs


def _incomplete(r: ComparisonResult) -> bool:
    return not (r.explanation_reason or "").strip() or not (r.explanation_plan or "").strip()


@transaction.atomic
def mark_explanations_ready(user: User, lini1_position_id: Any, result_ids: list[Any]) -> None:
    l1 = str(lini1_position_id)
    db = assessment_db([l1])
    a = _actor(user, db, 4, l1)
    results = [r for r in _results_of(l1, result_ids) if r.explanation_status != "sent"]
    missing = [str(r.id) for r in results if r.explanation_required and _incomplete(r)]
    if missing:
        raise ApiError("gaps", GAPS, missing)
    for r in results:
        r.explanation_status = "ready"
        r.save(update_fields=["explanation_status"])
    # Audit entity ids hold one id; the result ids go into `after`.
    _audit(
        a,
        "tandai_siap_penjelasan",
        "Position",
        l1,
        None,
        {"count": len(results), "results": [str(r.id) for r in results]},
    )


@transaction.atomic
def send_explanations(user: User, lini1_position_id: Any, result_ids: list[Any]) -> int:
    """Pejabat sends; immutable afterwards (INV-23); lateness fixed; Lini 2/3 notified."""
    l1 = str(lini1_position_id)
    db = assessment_db([l1])
    a = _actor(user, db, 5, l1)
    results = [
        r
        for r in _results_of(l1, result_ids)
        if r.explanation_status != "sent" and r.result == "tidak_sesuai"
    ]
    if not results:
        raise ApiError("nothing", "Tidak ada penjelasan yang perlu dikirim.")
    missing = [
        str(r.id)
        for r in results
        if (r.explanation_required or r.explanation_reason or r.explanation_plan) and _incomplete(r)
    ]
    if missing:
        raise ApiError("gaps", GAPS, missing)
    position = _find(db["positions"], "id", l1)
    assert position is not None
    for r in results:
        rq = _lini1_of_rq(r.risk_quarter_id)
        q = rq.quarter
        row = _find(db["results"], "id", str(r.id))
        assert row is not None
        previous = r.explanation_status
        r.explanation_status = "sent"
        r.explanation_sent_at = a.at
        r.explanation_sent_by = user
        r.explanation_lateness = rules.explanation_lateness(db, row, a.at_iso, q.fiscal_year_id)
        r.save()
        own_opened = [
            str(p)
            for p in ComparisonResult.objects.filter(risk_quarter_id=rq.id).values_list(
                "lini3_position_id", flat=True
            )
        ]
        recipients = set(
            comparisons.holders_of(db, access.assigned_lini2(db, l1, str(q.id)), a.today)
        ) | set(comparisons.holders_of(db, own_opened, a.today))
        for uid in recipients:
            notify(
                user=User.objects.get(pk=uid),
                kind="explanation_sent",
                text=f"{position['name']} mengirim penjelasan untuk "
                f"'{rq.register_risk.description_snapshot}'",
                target_url=f"/jabatan/{l1}/penilaian/{q.fiscal_year_id}/{q.number}",
                event_key=f"expl-sent:{r.id}",
                at=a.at,
            )
        _audit(
            a,
            "kirim_penjelasan",
            "ComparisonResult",
            r.id,
            {"status": previous},
            {"status": "sent", "lateness": r.explanation_lateness},
        )
    # U-07: the last explanation sent can complete the quarter's sheet.
    from simario.sheets.services import run_sheet_freeze

    run_sheet_freeze(a.at, {l1})
    return len(results)


def log_blind_view(user: User, position_id: Any, quarter_id: Any) -> None:
    """FR-NIL-012: every view of unopened assessments is audit-logged."""
    record(
        action="lihat_penilaian_sebelum_dibuka",
        entity_type="Quarter",
        entity_id=str(quarter_id),
        actor=user,
        acting_as="superadmin",
        after={"position": str(position_id)},
        at=clock.now(),
    )
