"""Final-review findings of B4: upload limits, download visibility, read checks, storage cleanup,
polling and scan robustness."""

import datetime as dt
import json
from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from simario.assessments.models import Assessment
from simario.board import files, services, tasks
from simario.board.models import Attachment, Comment
from simario.core import clock
from simario.registers.models import RegisterMitigation
from tests.demo import client_for, uid, user

RISK = uid("rr-a1-penyerapan")
URL = f"/api/v1/register-risks/{RISK}/comments"
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, bytes]]:
    objects: dict[str, bytes] = {}
    monkeypatch.setattr(files, "put", lambda key, data, mime: objects.__setitem__(key, data))
    monkeypatch.setattr(files, "delete", lambda key: objects.pop(key, None))
    monkeypatch.setattr(files, "read", lambda key: objects[key])
    monkeypatch.setattr(files, "clamd_scan", lambda data: True)
    yield objects


def _post(persona: str, uploads: list[Any], **data: Any) -> Any:
    form: dict[str, Any] = {"data": json.dumps({"body": "Bukti", **data}), "files": uploads}
    return client_for(persona).post(URL, form, format="multipart")


def test_limits_checked_before_reading(demo: None, storage: dict[str, bytes]) -> None:
    many = [SimpleUploadedFile(f"f{i}.pdf", PDF) for i in range(11)]
    assert _post("usr-andi", many).json()["message"] == "Maksimal 10 berkas per komentar."
    big = SimpleUploadedFile("besar.pdf", PDF + b"0" * (21 * 1024 * 1024))
    assert _post("usr-andi", [big]).json()["message"] == "besar.pdf: Ukuran berkas melebihi 20 MB."
    assert storage == {}


def test_storage_cleaned_when_post_fails(
    demo: None, storage: dict[str, bytes], monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(**kwargs: Any) -> None:
        raise RuntimeError("audit down")

    monkeypatch.setattr(services, "record", boom)
    res = _post("usr-andi", [SimpleUploadedFile("bukti.pdf", PDF)])
    assert res.status_code == 500
    assert storage == {}
    assert not Attachment.objects.filter(filename="bukti.pdf").exists()


def test_withdrawn_comment_files_not_downloadable(demo: None, storage: dict[str, bytes]) -> None:
    cid = _post("usr-andi", [SimpleUploadedFile("bukti.pdf", PDF)]).json()["id"]
    att = Attachment.objects.get(owner_id=cid)
    att.scan_status = "clean"
    att.save()
    andi = client_for("usr-andi")
    assert andi.get(f"/api/v1/attachments/{att.id}/download").status_code == 302
    andi.post(f"/api/v1/comments/{cid}/withdraw")
    assert andi.get(f"/api/v1/attachments/{att.id}/download").status_code == 404


def test_assessment_files_follow_blind_rules(demo: None) -> None:
    """A Lini 3 draft's evidence is not downloadable by Lini 1 (VIS-1, INV-16)."""
    draft = Assessment.objects.filter(assessor_line=3, status="draft").first()
    assert draft is not None
    att = Attachment.objects.create(
        owner_kind="assessment",
        owner_id=draft.id,
        filename="bukti.pdf",
        size=10,
        mime_type="application/pdf",
        scan_status="clean",
        uploaded_by=user("usr-hendra"),
        uploaded_at=clock.now(),
    )
    holder = draft.risk_quarter.register_risk.register.position_id
    assert str(holder) == uid("pos-ppk-a1")
    assert client_for("usr-andi").get(f"/api/v1/attachments/{att.id}/download").status_code == 404


def test_follow_needs_read_access(demo: None) -> None:
    res = client_for("usr-bambang").put(f"/api/v1/register-risks/{RISK}/subscription")
    assert res.status_code == 403


def test_mitigation_must_belong_to_the_risk(demo: None, storage: dict[str, bytes]) -> None:
    other = RegisterMitigation.objects.exclude(register_risk__id=RISK).first()
    assert other is not None
    res = _post("usr-andi", [], mitigationId=str(other.id))
    assert res.status_code == 422


def test_poll_returns_ids_and_rejects_bad_since(demo: None) -> None:
    comment = Comment.objects.filter(register_risk__id=RISK).exclude(author=user("usr-andi")).first()
    assert comment is not None
    since = comment.created_at.astimezone(clock.WITA).strftime("%Y-%m-%dT%H:%M")
    res = client_for("usr-andi").get(f"/api/v1/register-risks/{RISK}/thread", {"since": since})
    assert str(comment.id) in res.json()["commentIds"]
    bad = client_for("usr-andi").get(f"/api/v1/register-risks/{RISK}/thread", {"since": "x"})
    assert bad.status_code == 422


def test_sweep_survives_storage_errors(demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
    from botocore.exceptions import ClientError

    Attachment.objects.create(
        owner_kind="comment",
        owner_id=Comment.objects.first().id,  # type: ignore[union-attr]
        filename="hilang.pdf",
        size=10,
        mime_type="application/pdf",
        scan_status="pending",
        uploaded_by=user("usr-andi"),
        uploaded_at=clock.now(),
        object_key="attachments/missing",
    )

    def missing(key: str) -> bytes:
        raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")

    monkeypatch.setattr(files, "read", missing)
    tasks.sweep_pending(clock.now() + dt.timedelta(minutes=1))
    assert Attachment.objects.get(filename="hilang.pdf").scan_status == "pending"
