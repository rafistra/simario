"""Ports of assessmentApi checks (frontend/src/data/api/assessment.ts) on the demo seed."""

import json
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from simario.assessments.models import Assessment, ComparisonResult
from simario.audit.models import AuditLog
from simario.board import files
from simario.board.models import Attachment
from simario.core import clock
from simario.devtools.seed import legacy_uuid
from simario.notifications.models import Notification
from tests.demo import client_for, uid, user

A1 = uid("pos-ppk-a1")
KEP = uid("pos-kepatuhan")
Q1, Q2 = uid("q-2027-1"), uid("q-2027-2")
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, bytes]]:
    objects: dict[str, bytes] = {}
    monkeypatch.setattr(files, "put", lambda key, data, mime: objects.__setitem__(key, data))
    monkeypatch.setattr(files, "delete", lambda key: objects.pop(key, None))
    yield objects


def _rq(risk: str, quarter: str = "q-2027-2") -> uuid.UUID:
    return legacy_uuid(f"rq-{risk}-{quarter}")


def _cell(persona: str, rq: Any, assessor: str, **patch: Any) -> Any:
    return client_for(persona).patch(
        f"/api/v1/risk-quarters/{rq}/assessments/{assessor}", patch, format="json"
    )


def _error(res: Any) -> str:
    return str(res.json()["message"])


def _at(when: str) -> None:
    clock.set_now(clock.parse_local(when))


def test_lini3_saves_a_draft_cell(demo: None) -> None:
    rq = _rq("rr-a1-material")
    res = _cell("usr-hendra", rq, KEP, score=1)
    assert res.status_code == 204, res.json()
    a = Assessment.objects.get(
        risk_quarter_id=rq, assessor_position_id=legacy_uuid("pos-kepatuhan")
    )
    assert a.status == "draft" and float(a.score or 0) == 1 and a.predicate == "kurang"
    assert AuditLog.objects.filter(action="simpan_draf_penilaian", entity_id=str(a.id)).exists()
    assert _error(_cell("usr-hendra", rq, KEP, score=2.7)) == "Pilihan penilaian tidak dikenal."
    assert (
        _error(_cell("usr-hendra", rq, KEP, notRelevant=True))
        == '"Belum relevan" tidak tersedia untuk Lini 3.'
    )


def test_window_and_permission_checks(demo: None) -> None:
    rq = _rq("rr-a1-material")
    assert _error(_cell("usr-andi", rq, A1, score=3)) == "Penilaian TW II dibuka mulai 1 Jun 2027."
    res = _cell("usr-bambang", rq, A1, score=3)
    assert res.status_code == 403
    assert _error(res) == "Tindakan ini hanya untuk pemegang jabatan penilai."
    _at("2027-06-02T09:00")
    assert _error(_cell("usr-andi", rq, A1, score=3, note="x")) == (
        "Catatan penilaian hanya untuk Lini 3."
    )


def test_frozen_after_opening(demo: None) -> None:
    """INV-18: TW I comparisons are open, so Lini 1 can neither edit nor reopen."""
    rq = _rq("rr-a1-penyerapan", "q-2027-1")
    assert _error(_cell("usr-andi", rq, A1, score=3)) == (
        "Perbandingan risiko ini sudah dibuka; penilaian tidak dapat diubah."
    )
    a = Assessment.objects.get(risk_quarter_id=rq, assessor_line=1)
    res = client_for("usr-andi").post(f"/api/v1/assessments/{a.id}/reopen")
    assert _error(res) == (
        "Perbandingan risiko ini sudah dibuka; penilaian tidak dapat dibuka kembali."
    )


def test_operator_marks_ready_and_pejabat_finalises(demo: None) -> None:
    _at("2027-06-02T09:00")
    rq = _rq("rr-a1-material")
    assert _cell("usr-rafi", rq, A1, score=3).status_code == 204
    base = f"/api/v1/positions/{A1}/quarters/{Q2}/assessments/{A1}"
    res = client_for("usr-rafi").post(f"{base}/ready")
    assert res.status_code == 200 and res.json() == {"count": 1}
    assert Notification.objects.filter(user=user("usr-andi"), kind="ready").exists()
    res = client_for("usr-rafi").post(f"{base}/finalise")
    assert res.status_code == 403 and _error(res) == "Tindakan akhir dilakukan oleh Pejabat."
    res = client_for("usr-andi").post(f"{base}/finalise")
    assert res.status_code == 200, res.json()
    assert res.json()["toFinalise"] == 1
    a = Assessment.objects.get(risk_quarter_id=rq, assessor_line=1)
    assert a.status == "final" and a.lateness is None and a.flags == ["no_evidence"]
    assert a.finalised_by == user("usr-andi")
    # Nothing opens yet: the directorates have not finalised and the deadline is far.
    assert not ComparisonResult.objects.filter(risk_quarter_id=rq).exists()
    res = client_for("usr-andi").post(f"/api/v1/assessments/{a.id}/reopen")
    assert res.status_code == 204
    a.refresh_from_db()
    assert a.status == "draft" and a.finalised_at is None


def test_finalise_refuses_missing_reason(demo: None) -> None:
    _at("2027-06-02T09:00")
    _cell("usr-andi", _rq("rr-a1-material"), A1, notRelevant=True)
    res = client_for("usr-andi").post(
        f"/api/v1/positions/{A1}/quarters/{Q2}/assessments/{A1}/finalise"
    )
    assert _error(res) == 'Alasan "Belum relevan" wajib diisi untuk 1 risiko.'


def test_late_finalise_marks_lateness(demo: None) -> None:
    _at("2027-07-01T09:00")
    _cell("usr-andi", _rq("rr-a1-material"), A1, score=4)
    client_for("usr-andi").post(f"/api/v1/positions/{A1}/quarters/{Q2}/assessments/{A1}/finalise")
    a = Assessment.objects.get(risk_quarter_id=_rq("rr-a1-material"), assessor_line=1)
    assert a.lateness == "terlambat"


def test_evidence_upload_and_remove(demo: None, storage: dict[str, bytes]) -> None:
    rq = _rq("rr-a1-material")
    url = f"/api/v1/risk-quarters/{rq}/assessments/{KEP}/files"
    res = client_for("usr-hendra").post(
        url,
        {
            "files": [SimpleUploadedFile("bukti.pdf", PDF, "application/pdf")],
            "data": json.dumps({"confidential": [True]}),
        },
        format="multipart",
    )
    assert res.status_code == 204, res.json()
    f = Attachment.objects.get(filename="bukti.pdf")
    assert f.owner_kind == "assessment" and f.is_confidential and f.object_key in storage
    res = client_for("usr-hendra").delete(f"/api/v1/assessment-files/{f.id}")
    assert res.status_code == 204
    assert not Attachment.objects.filter(pk=f.id).exists() and not storage


def test_explanations_flow(demo: None) -> None:
    r = ComparisonResult.objects.get(pk=legacy_uuid("cr-rq-rr-a1-penyerapan-q-2027-1-pos-pai"))
    url = f"/api/v1/results/{r.id}/explanation"
    assert (
        client_for("usr-rafi").patch(url, {"reason": "Kendala"}, format="json").status_code == 204
    )
    ready = f"/api/v1/positions/{A1}/explanations/ready"
    res = client_for("usr-rafi").post(ready, {"resultIds": [str(r.id)]}, format="json")
    assert _error(res) == "Alasan/Kendala dan Rencana Tindak Lanjut wajib diisi."
    client_for("usr-rafi").patch(url, {"plan": "Rencana"}, format="json")
    assert (
        client_for("usr-rafi").post(ready, {"resultIds": [str(r.id)]}, format="json").status_code
        == 204
    )
    r.refresh_from_db()
    assert r.explanation_status == "ready"
    send = f"/api/v1/positions/{A1}/explanations/send"
    assert (
        client_for("usr-rafi").post(send, {"resultIds": [str(r.id)]}, format="json").status_code
        == 403
    )
    res = client_for("usr-andi").post(send, {"resultIds": [str(r.id)]}, format="json")
    assert res.status_code == 200 and res.json() == {"count": 1}
    r.refresh_from_db()
    assert r.explanation_status == "sent" and r.explanation_lateness is None
    assert Notification.objects.filter(user=user("usr-maya"), kind="explanation_sent").exists()
    res = client_for("usr-andi").patch(url, {"reason": "ubah"}, format="json")
    assert _error(res) == "Penjelasan yang sudah dikirim tidak dapat diubah."
