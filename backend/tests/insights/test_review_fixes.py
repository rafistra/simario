"""Final review B8 fixes: Lini 1 blind values, deleted confidential names, bounded audit reads."""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from simario.audit.models import AuditLog
from simario.board import files
from simario.board.models import Attachment
from simario.core import clock
from simario.insights import audit_trail
from tests.demo import client_for, uid, user

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, bytes]]:
    objects: dict[str, bytes] = {}
    monkeypatch.setattr(files, "put", lambda key, data, mime: objects.__setitem__(key, data))
    monkeypatch.setattr(files, "delete", lambda key: objects.pop(key, None))
    monkeypatch.setattr(files, "clamd_scan", lambda data: True)
    yield objects


def _rows(persona: str, action: str) -> list[dict[str, Any]]:
    res = client_for(persona).get(f"/api/v1/audit?action={action}")
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def test_lini1_not_relevant_is_blind_too(demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
    clock.set_now(clock.parse_local("2027-06-02T09:00"))
    rq = uid("rq-rr-a1-material-q-2027-2")
    res = client_for("usr-andi").patch(
        f"/api/v1/risk-quarters/{rq}/assessments/{uid('pos-ppk-a1')}",
        {"notRelevant": True, "notRelevantReason": "Belum ada kontrak"},
        format="json",
    )
    assert res.status_code == 204
    # A viewer with 23 but not 24 (and not the assessor): the reason never shows.
    rows = _rows("usr-admin", "simpan_draf_penilaian")
    text = json.dumps([r for r in rows if r["actorUserId"] == uid("usr-andi")])
    assert "Belum ada kontrak" not in text and '"notRelevant": true' not in text


def test_deleted_confidential_file_name_stays_hidden(
    demo: None, storage: dict[str, bytes], monkeypatch: pytest.MonkeyPatch
) -> None:
    rq = uid("rq-rr-a1-material-q-2027-2")
    url = f"/api/v1/risk-quarters/{rq}/assessments/{uid('pos-kepatuhan')}/files"
    client_for("usr-hendra").post(
        url,
        {"files": [SimpleUploadedFile("temuan-x.pdf", PDF, "application/pdf")]},
        format="multipart",
    )
    f = Attachment.objects.get(filename="temuan-x.pdf")
    assert f.is_confidential
    client_for("usr-hendra").delete(f"/api/v1/assessment-files/{f.id}")
    monkeypatch.setattr(
        audit_trail.access,  # type: ignore[attr-defined]
        "has_permission",
        lambda db, uid_, code, today: code != 10,
    )
    entries = audit_trail.build_audit(user("usr-admin"), {}, False)
    text = json.dumps(
        [
            e
            for e in entries
            if e["action"] in ("lampirkan_bukti_penilaian", "hapus_bukti_penilaian")
        ]
    )
    assert "temuan-x.pdf" not in text and "[konfidensial]" in text


def test_audit_reads_are_bounded(demo: None) -> None:
    for i in range(audit_trail.MAX_ROWS + 5):
        AuditLog.objects.create(
            at=clock.now(), actor=user("usr-andi"), action="uji", entity_type="X", entity_id=str(i)
        )
    assert len(_rows("usr-admin", "uji")) == audit_trail.MAX_ROWS
