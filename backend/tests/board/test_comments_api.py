"""Ports of thread.ts checks, plus files (spec §4.7): S3 and clamd are replaced by fakes."""

import datetime as dt
import json
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from simario.audit.models import AuditLog
from simario.board import files, services
from simario.board.models import Attachment, Comment
from simario.core import clock
from simario.domain import board as rules
from simario.notifications.models import Notification
from tests.demo import client_for, uid, user

RISK = uid("rr-a1-penyerapan")
URL = f"/api/v1/register-risks/{RISK}/comments"
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    objects: dict[str, bytes] = {}
    state: dict[str, Any] = {"objects": objects, "clean": True}
    monkeypatch.setattr(files, "put", lambda key, data, mime: objects.__setitem__(key, data))
    monkeypatch.setattr(files, "read", lambda key: objects[key])

    def quarantine(key: str) -> str:
        objects[f"quarantine/{key}"] = objects.pop(key)
        return f"quarantine/{key}"

    monkeypatch.setattr(files, "quarantine", quarantine)
    monkeypatch.setattr(files, "clamd_scan", lambda data: state["clean"])
    yield state


def _post(
    persona: str,
    body: str = "Progres minggu ini",
    files_: list[tuple[str, bytes]] | None = None,
    **data: Any,
) -> Any:
    payload = {"body": body, **data}
    form: dict[str, Any] = {"data": json.dumps(payload)}
    if files_:
        form["files"] = [SimpleUploadedFile(n, c) for n, c in files_]
    return client_for(persona).post(URL, form, format="multipart")


def test_post_notifies_holders_and_mentions(demo: None, storage: dict[str, Any]) -> None:
    res = _post("usr-andi", mentionUserIds=[uid("usr-siti")])
    assert res.status_code == 201, res.json()
    comment = Comment.objects.get(pk=res.json()["id"])
    assert comment.author_line == 1 and comment.acting_as == "pejabat"
    assert Notification.objects.filter(user=user("usr-rafi"), kind="new_comments").exists()
    assert Notification.objects.filter(user=user("usr-siti"), kind="mention").exists()
    assert AuditLog.objects.filter(action="kirim_komentar", entity_id=str(comment.id)).exists()

    def rafi_count() -> int:
        note = Notification.objects.filter(
            user=user("usr-rafi"), kind="new_comments", read_at__isnull=True
        ).latest("created_at")
        return int(note.text.split()[0])

    before = rafi_count()
    assert _post("usr-andi", "Lagi").status_code == 201
    assert rafi_count() == before + 1


def test_participation_and_step_rules(demo: None, storage: dict[str, Any]) -> None:
    reader = _post("usr-dewi")
    assert reader.status_code == 403
    assert (
        reader.json()["message"] == "Anda dapat membaca utas ini, tetapi tidak dapat berkomentar."
    )
    step = _post("usr-hendra", isStep=True)
    assert step.json()["message"] == "Hanya Lini 1 yang dapat menandai Langkah."
    empty = _post("usr-andi", "  ")
    assert empty.json()["message"] == "Tulis komentar atau lampirkan berkas."


def test_edit_window_and_withdraw(demo: None, storage: dict[str, Any]) -> None:
    cid = _post("usr-andi").json()["id"]
    andi = client_for("usr-andi")
    assert (
        andi.patch(f"/api/v1/comments/{cid}", {"body": "Diperbaiki"}, format="json").status_code
        == 204
    )
    assert Comment.objects.get(pk=cid).edited_at is not None
    assert (
        client_for("usr-rafi")
        .patch(f"/api/v1/comments/{cid}", {"body": "x"}, format="json")
        .status_code
        == 403
    )
    clock.set_now(clock.now() + dt.timedelta(minutes=16))
    late = andi.patch(f"/api/v1/comments/{cid}", {"body": "Terlambat"}, format="json")
    assert late.status_code == 409 and late.json()["code"] == "edit_window"
    assert andi.post(f"/api/v1/comments/{cid}/withdraw").status_code == 204
    entry = AuditLog.objects.get(action="tarik_komentar", entity_id=cid)
    assert entry.before is not None and entry.before["body"] == "Diperbaiki"
    thread = andi.get(f"/api/v1/register-risks/{RISK}/thread").json()
    mine = next(c for g in thread["timeline"] for c in g["comments"] if c["id"] == cid)
    assert mine["body"] is None and mine["withdrawnText"].startswith("Komentar ditarik oleh Andi")


def test_confidential_upload_scan_and_download(
    demo: None,
    storage: dict[str, Any],
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    refused = _post("usr-andi", files_=[("bukti.pdf", PDF)], confidential=[True])
    assert refused.json()["message"] == "Hanya Lini 3 yang dapat menandai lampiran konfidensial."
    with django_capture_on_commit_callbacks(execute=True):
        res = _post("usr-hendra", "Bukti audit", files_=[("bukti.pdf", PDF)], confidential=[True])
    assert res.status_code == 201, res.json()
    att = Attachment.objects.get(owner_id=res.json()["id"])
    assert att.is_confidential and att.mime_type == "application/pdf"
    assert att.scan_status == "clean"
    assert att.object_key == f"attachments/{uid('pos-ppk-a1')}/2027/{att.id}"
    url = f"/api/v1/attachments/{att.id}/download"
    assert client_for("usr-andi").get(url).status_code == 404
    hendra = client_for("usr-hendra").get(url)
    assert hendra.status_code == 302
    assert hendra["Location"].startswith(f"/storage/simario/{att.object_key}?")


def test_infected_file_is_quarantined(
    demo: None,
    storage: dict[str, Any],
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    storage["clean"] = False
    with django_capture_on_commit_callbacks(execute=True):
        res = _post("usr-andi", "Lampiran", files_=[("eicar.pdf", PDF)])
    att = Attachment.objects.get(owner_id=res.json()["id"])
    assert att.scan_status == "quarantined" and str(att.object_key).startswith("quarantine/")
    assert Notification.objects.filter(
        user=user("usr-andi"), kind="attachment_quarantined"
    ).exists()
    assert AuditLog.objects.filter(action="karantina_lampiran").exists()
    assert client_for("usr-andi").get(f"/api/v1/attachments/{att.id}/download").status_code == 404


def test_content_must_match_extension(demo: None, storage: dict[str, Any]) -> None:
    res = _post("usr-andi", files_=[("laporan.pdf", b"bukan pdf sama sekali")])
    assert res.status_code == 422
    assert res.json()["message"] == "laporan.pdf: Isi berkas tidak sesuai dengan formatnya."
    exe = _post("usr-andi", files_=[("skrip.exe", b"MZ")])
    assert exe.json()["message"].startswith("skrip.exe: Format .exe tidak didukung.")


def test_quota(demo: None, storage: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(services, "storage_used", lambda pos, year: rules.QUOTA_BYTES)
    res = _post("usr-andi", files_=[("bukti.pdf", PDF)])
    assert res.status_code == 413 and res.json()["code"] == "quota"


def test_follow_rules(demo: None) -> None:
    sub = f"/api/v1/register-risks/{RISK}/subscription"
    assert client_for("usr-andi").delete(sub).status_code == 403
    siti = client_for("usr-siti")
    assert siti.put(sub).status_code == 204
    assert siti.delete(sub).status_code == 204
    assert client_for("usr-andi").post(f"/api/v1/register-risks/{RISK}/seen").status_code == 204
