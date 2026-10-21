"""Board threads (PRD §6, FR-PPN-003 … 012). Ports threadApi in frontend/src/data/api/thread.ts:
posting needs participation (§1.5, permission 6) for the comment's quarter; Langkah is Lini 1 only
and only in the posting quarter (RB-PPN-004); confidential files are Lini 3 (FR-PPN-006). Nothing is
deleted (RB-PPN-003). Files go to RustFS and are scanned by ClamAV before anyone else sees them."""

import datetime as dt
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import Sum

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.audit.services import record
from simario.core import clock
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import board as rules
from simario.notifications.models import Notification
from simario.notifications.services import notify
from simario.org.models import Position
from simario.registers.models import Register, RegisterRisk

from . import files
from .models import Attachment, Comment, Mention, ThreadSubscription, ThreadView
from .selectors import board_db, now_iso

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Upload:
    name: str
    data: bytes
    confidential: bool


def _context(risk_id: Any) -> tuple[RegisterRisk, Register]:
    risk = (
        RegisterRisk.objects.select_related("register__position", "register__fiscal_year")
        .filter(pk=risk_id)
        .first()
    )
    if risk is None:
        raise ApiError("not_found", "Risiko tidak ditemukan.")
    fy = risk.register.fiscal_year
    if fy.status == "archived":
        day = fy.archived_at.date().isoformat() if fy.archived_at else ""
        raise ApiError("archived", f"Utas ini diarsipkan pada {day}. Utas hanya dapat dibaca.")
    return risk, risk.register


def _thread_url(risk: RegisterRisk, register: Register) -> str:
    return f"/jabatan/{register.position_id}/papan/{register.fiscal_year_id}/risiko/{risk.id}"


def _short(risk: RegisterRisk) -> str:
    d = risk.description_snapshot
    return f"{d[:79]}…" if len(d) > 80 else d


def _audit(
    user: User,
    at: dt.datetime,
    holding: dict[str, Any] | None,
    action: str,
    entity_type: str,
    entity_id: Any,
    before: Any,
    after: Any,
) -> None:
    record(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        actor=user,
        acting_as=holding["capacity"] if holding else None,
        acting_position=Position.objects.get(pk=holding["position_id"]) if holding else None,
        before=before,
        after=after,
        at=at,
    )


def _subscribe(user_id: Any, risk: RegisterRisk) -> None:
    ThreadSubscription.objects.update_or_create(
        user_id=user_id, register_risk=risk, defaults={"muted": False}
    )


def _thousands(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def storage_used(position_id: Any, fiscal_year: int) -> int:
    """Bytes of a position's thread and assessment files in a fiscal year (NFR-012)."""
    from simario.assessments.models import Assessment

    comments = Comment.objects.filter(
        register_risk__register__position_id=position_id,
        register_risk__register__fiscal_year_id=fiscal_year,
    ).values("id")
    assessments = Assessment.objects.filter(
        risk_quarter__register_risk__register__position_id=position_id,
        risk_quarter__register_risk__register__fiscal_year_id=fiscal_year,
    ).values("id")
    total = Attachment.objects.filter(owner_id__in=comments).aggregate(n=Sum("size"))["n"] or 0
    total += Attachment.objects.filter(owner_id__in=assessments).aggregate(n=Sum("size"))["n"] or 0
    return int(total)


@transaction.atomic
def post(user: User, risk_id: Any, data: dict[str, Any], uploads: list[Upload]) -> uuid.UUID:
    at = clock.now()
    at_iso = now_iso()
    today = at_iso[:10]
    risk, register = _context(risk_id)
    # Serialise posts to one register so the quota and aggregated notifications stay exact.
    Register.objects.select_for_update().get(pk=register.pk)
    db = board_db(register.position)
    posting = rules.posting_quarter(db, register.fiscal_year_id, today)
    if posting is None:
        raise ApiError("not_started", f"Tahun anggaran {register.fiscal_year_id} belum dimulai.")
    quarter_id = str(data.get("quarter_id") or posting["id"])
    risk_row = next(r for r in db["risks"] if r["id"] == str(risk.id))
    if quarter_id != posting["id"] and not any(
        q["id"] == quarter_id for q in rules.related_quarters(db, risk_row, posting, at_iso)
    ):
        raise ApiError("validation", "Triwulan terkait tidak dapat dipilih untuk risiko ini.")
    uid = str(user.id)
    holding = access.participation_holding(db, uid, str(register.position_id), quarter_id, today)
    if holding is None:
        raise ApiError("forbidden", "Anda dapat membaca utas ini, tetapi tidak dapat berkomentar.")
    body = (data.get("body") or "").replace("\r\n", "\n").strip()
    is_step = bool(data.get("is_step"))
    if not body and not uploads:
        raise ApiError("validation", "Tulis komentar atau lampirkan berkas.")
    if len(body) > rules.MAX_COMMENT_LENGTH:
        raise ApiError(
            "validation", f"Komentar maksimal {_thousands(rules.MAX_COMMENT_LENGTH)} karakter."
        )
    if is_step and holding["line"] != 1:
        raise ApiError("validation", "Hanya Lini 1 yang dapat menandai Langkah.")
    if is_step and quarter_id != posting["id"]:
        raise ApiError(
            "validation",
            "Langkah selalu tercatat pada triwulan berjalan; pilih triwulan berjalan untuk "
            "menandai Langkah.",
        )
    if len(uploads) > rules.MAX_FILES:
        raise ApiError("validation", f"Maksimal {rules.MAX_FILES} berkas per komentar.")
    mimes = []
    for f in uploads:
        problem = rules.file_problem(f.name, len(f.data))
        if problem:
            raise ApiError("validation", f"{f.name}: {problem}")
        mime = files.content_mime(f.name, f.data)
        if mime is None:
            raise ApiError("validation", f"{f.name}: {files.CONTENT_MISMATCH}")
        mimes.append(mime)
    if any(f.confidential for f in uploads) and holding["line"] != 3:
        raise ApiError("validation", "Hanya Lini 3 yang dapat menandai lampiran konfidensial.")
    incoming = sum(len(f.data) for f in uploads)
    if incoming and storage_used(register.position_id, register.fiscal_year_id) + incoming > (
        rules.QUOTA_BYTES
    ):
        raise ApiError(
            "quota",
            f"Kuota penyimpanan 1 GB untuk jabatan ini pada TA {register.fiscal_year_id} sudah "
            "penuh. Unggahan ditolak.",
        )
    participants = {
        p["user_id"]
        for p in rules.thread_participants(db, str(register.position_id), quarter_id, today)
    }
    mentions = [
        m
        for m in dict.fromkeys(str(x) for x in data.get("mention_user_ids") or [])
        if m != uid and m in participants
    ]

    mitigation_id = data.get("mitigation_id")
    comment = Comment.objects.create(
        register_risk=risk,
        register_mitigation_id=mitigation_id,
        author=user,
        author_line=holding["line"],
        acting_as=holding["capacity"],
        acting_position_id=holding["position_id"],
        quarter_id=quarter_id,
        body=body,
        is_step=is_step,
        created_at=at,
    )
    Mention.objects.bulk_create([Mention(comment=comment, user_id=m) for m in mentions])
    stored: list[uuid.UUID] = []
    for f, mime in zip(uploads, mimes, strict=True):
        aid = uuid.uuid4()
        key = files.key_for(register.position_id, register.fiscal_year_id, aid)
        files.put(key, f.data, mime)
        Attachment.objects.create(
            id=aid,
            owner_kind="comment",
            owner_id=comment.id,
            filename=f.name,
            size=len(f.data),
            mime_type=mime,
            scan_status="pending",
            is_confidential=f.confidential,
            uploaded_by=user,
            uploaded_at=at,
            object_key=key,
        )
        stored.append(aid)
    _subscribe(user.id, risk)
    ThreadView.objects.update_or_create(
        user=user, register_risk=risk, defaults={"last_seen_at": at}
    )

    base = _thread_url(risk, register)
    for m in mentions:
        _subscribe(m, risk)
        notify(
            user=User.objects.get(pk=m),
            kind="mention",
            text=f"{user.full_name} menyebut Anda di utas '{_short(risk)}'",
            target_url=f"{base}#komentar-{comment.id}",
            event_key=f"mention:{comment.id}:{m}",
            at=at,
        )
    # FR-NTF-004: subscribers (holders always) except the author, the muted and the mentioned;
    # aggregated while unread.
    adb = load_access_db()
    recipients = {
        u["id"]
        for u in adb["users"]
        if u["active"]
        and rules.is_always_subscribed(adb, u["id"], str(register.position_id), today)
    }
    recipients |= {
        str(s)
        for s in ThreadSubscription.objects.filter(register_risk=risk, muted=False).values_list(
            "user_id", flat=True
        )
    }
    recipients -= {uid, *mentions}
    for r in recipients:
        open_note = (
            Notification.objects.select_for_update()
            .filter(user_id=r, kind="new_comments", read_at__isnull=True, target_url=base)
            .first()
        )
        if open_note:
            match = re.match(r"^(\d+)", open_note.text)
            count = int(match.group(1)) + 1 if match else 2
            open_note.text = f"{count} komentar baru di '{_short(risk)}'"
            open_note.created_at = at
            open_note.save(update_fields=["text", "created_at"])
        else:
            notify(
                user=User.objects.get(pk=r),
                kind="new_comments",
                text=f"1 komentar baru di '{_short(risk)}'",
                target_url=base,
                event_key=f"thread:{risk.id}:{r}:{at_iso}:{comment.id}",
                at=at,
            )
    _audit(
        user,
        at,
        dict(holding),
        "kirim_komentar",
        "Comment",
        comment.id,
        None,
        {
            "quarterId": quarter_id,
            "isStep": is_step,
            "mitigationId": str(mitigation_id) if mitigation_id else None,
            "files": len(uploads),
        },
    )
    if stored:
        from .tasks import scan_attachment

        def scan_later(aid: uuid.UUID) -> None:
            transaction.on_commit(lambda: scan_attachment.delay(str(aid)))

        for aid in stored:
            scan_later(aid)
    return comment.id


def _own_comment(user: User, comment_id: Any, verb: str) -> Comment:
    c = Comment.objects.select_for_update().filter(pk=comment_id).first()
    if c is None:
        raise ApiError("not_found", "Komentar tidak ditemukan.")
    _context(c.register_risk_id)
    if c.author_id != user.id:
        raise ApiError("forbidden", f"Hanya penulis yang dapat {verb} komentar.")
    return c


def _holding_of(c: Comment) -> dict[str, Any]:
    return {"capacity": c.acting_as, "position_id": str(c.acting_position_id)}


@transaction.atomic
def edit(user: User, comment_id: Any, body: str) -> None:
    """FR-PPN-008 / INV-19: author only, within 15 minutes."""
    c = _own_comment(user, comment_id, "menyunting")
    row = {
        "author_user_id": str(c.author_id),
        "withdrawn_at": c.withdrawn_at,
        "created_at": c.created_at.astimezone(clock.WITA).isoformat(),
    }
    if not rules.can_edit_comment(row, str(user.id), now_iso()):
        raise ApiError(
            "edit_window", "Komentar hanya dapat disunting dalam 15 menit setelah dikirim."
        )
    text = body.replace("\r\n", "\n").strip()
    if not text:
        raise ApiError("validation", "Komentar tidak boleh kosong.")
    if len(text) > rules.MAX_COMMENT_LENGTH:
        raise ApiError(
            "validation", f"Komentar maksimal {_thousands(rules.MAX_COMMENT_LENGTH)} karakter."
        )
    if c.body == text:
        return
    at = clock.now()
    _audit(
        user,
        at,
        _holding_of(c),
        "sunting_komentar",
        "Comment",
        c.id,
        {"body": c.body},
        {"body": text},
    )
    c.body = text
    c.edited_at = at
    c.save(update_fields=["body", "edited_at"])


@transaction.atomic
def withdraw(user: User, comment_id: Any) -> None:
    """FR-PPN-008 / VIS-6: the author may withdraw at any time; the original stays in audit."""
    c = _own_comment(user, comment_id, "menarik")
    if c.withdrawn_at:
        return
    at = clock.now()
    _audit(
        user,
        at,
        _holding_of(c),
        "tarik_komentar",
        "Comment",
        c.id,
        {"body": c.body, "isStep": c.is_step},
        {"withdrawnAt": at.isoformat()},
    )
    c.withdrawn_at = at
    c.withdrawn_by = user
    c.save(update_fields=["withdrawn_at", "withdrawn_by"])


@transaction.atomic
def set_confidential(user: User, attachment_id: Any, on: bool) -> None:
    """FR-PPN-006: switching on by the uploader; switching off needs permission 25."""
    a = Attachment.objects.select_for_update().filter(pk=attachment_id).first()
    if a is None:
        raise ApiError("not_found", "Lampiran tidak ditemukan.")
    c = Comment.objects.filter(pk=a.owner_id).first()
    if c:
        _context(c.register_risk_id)
    if on and a.uploaded_by_id != user.id:
        raise ApiError("forbidden", "Hanya pengunggah yang dapat menandai lampiran konfidensial.")
    today = clock.today().isoformat()
    if not on and not access.has_permission(load_access_db(), str(user.id), 25, today):
        raise ApiError("forbidden", "Mematikan status konfidensial memerlukan izin khusus.")
    if a.is_confidential == on:
        return
    _audit(
        user,
        clock.now(),
        None,
        "konfidensial_nyala" if on else "konfidensial_mati",
        "Attachment",
        a.id,
        {"isConfidential": a.is_confidential},
        {"isConfidential": on},
    )
    a.is_confidential = on
    a.save(update_fields=["is_confidential"])


@transaction.atomic
def follow(user: User, risk_id: Any, on: bool) -> None:
    """FR-PPN-010: the position's holders cannot unfollow."""
    risk, register = _context(risk_id)
    today = clock.today().isoformat()
    if not on and rules.is_always_subscribed(
        load_access_db(), str(user.id), str(register.position_id), today
    ):
        raise ApiError("forbidden", "Pemegang jabatan selalu mengikuti utas jabatannya.")
    ThreadSubscription.objects.update_or_create(
        user=user, register_risk=risk, defaults={"muted": not on}
    )


def mark_seen(user: User, risk_id: Any) -> None:
    """Records the visit for unseen-activity dots (FR-PPN-001). Not audited."""
    if RegisterRisk.objects.filter(pk=risk_id).exists():
        ThreadView.objects.update_or_create(
            user=user, register_risk_id=risk_id, defaults={"last_seen_at": clock.now()}
        )
