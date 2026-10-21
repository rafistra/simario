"""Ports of sheetApi (frontend/src/data/api/sheets.ts) on the demo seed."""

from typing import Any

import pytest

from simario.assessments.comparisons import run_comparisons
from simario.assessments.models import ComparisonResult
from simario.board.models import Attachment, Comment
from simario.core import clock
from simario.devtools.seed import legacy_uuid, load_demo
from simario.sheets.models import PrintSnapshot, SheetPhotoSelection
from tests.demo import client_for, uid, user

A1 = uid("pos-ppk-a1")
SHEET = f"/api/v1/positions/{A1}/sheets/2027/1"


def _get(persona: str, url: str = SHEET) -> dict[str, Any]:
    res = client_for(persona).get(url)
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def _print(persona: str, kinds: list[str]) -> list[str]:
    res = client_for(persona).post(f"{SHEET}/print", {"kinds": kinds}, format="json")
    assert res.status_code == 201, res.json()
    return res.json()["ids"]  # type: ignore[no-any-return]


def test_running_view(demo: None) -> None:
    body = _get("usr-andi")
    assert body["published"] and body["payload"]["risks"] and body["masked"] == []
    assert body["canPick"] == {"A": True, "B": False, "C": False}
    assert any(s["isProvisional"] for s in body["snapshots"])
    assert client_for("usr-bambang").get(SHEET).status_code == 403


def test_snapshot_numbers_unique_and_print_frozen_creates_nothing(demo: None) -> None:
    before = PrintSnapshot.objects.count()
    ids = _print("usr-andi", ["komunikasi", "mutu"]) + _print("usr-siti", ["komunikasi"])
    snaps = PrintSnapshot.objects.filter(pk__in=ids)
    numbers = sorted(s.number for s in snaps)
    assert len(set(numbers)) == 3 and all(s.trigger == "print" for s in snaps)
    lk = sorted(n for n in numbers if "/LK/" in n)
    assert lk[1].endswith(f"{int(lk[0][-3:]) + 1:03d}")
    assert all(s.is_provisional for s in snaps)  # TW I has no automatic version yet
    frozen = _get("usr-andi", f"{SHEET}?snapshot={ids[0]}")
    assert frozen["snapshot"]["id"] == ids[0]
    assert PrintSnapshot.objects.count() == before + 3


@pytest.mark.django_db
def test_frozen_copy_masked_for_late_directorate() -> None:
    load_demo(clock.parse_local("2027-04-02T23:00"))
    run_comparisons(clock.parse_local("2027-04-03T00:00"))
    clock.set_now(clock.parse_local("2027-04-03T09:00"))
    q1 = legacy_uuid("q-2027-1")
    a1 = legacy_uuid("pos-ppk-a1")
    kep = set(
        ComparisonResult.objects.filter(
            lini3_position_id=legacy_uuid("pos-kepatuhan"),
            risk_quarter__quarter_id=q1,
            risk_quarter__register_risk__register__position_id=a1,
        ).values_list("risk_quarter__register_risk_id", flat=True)
    )
    pai = set(
        ComparisonResult.objects.filter(
            lini3_position_id=legacy_uuid("pos-pai"),
            risk_quarter__quarter_id=q1,
            risk_quarter__register_risk__register__position_id=a1,
        ).values_list("risk_quarter__register_risk_id", flat=True)
    )
    only_kep = {str(r) for r in kep - pai}
    assert only_kep
    snap_id = _print("usr-andi", ["komunikasi"])[0]
    maya = _get("usr-maya", f"{SHEET}?snapshot={snap_id}")
    assert set(maya["masked"]) >= only_kep
    for r in maya["payload"]["risks"]:
        if r["riskId"] in only_kep:
            assert r["l1"]["optionLabel"] is None and r["l1"]["opened"] is False
            others = [x for x in r["lini3"] if x["positionId"] != uid("pos-pai")]
            assert all(x["optionLabel"] is None and x["result"] is None for x in others)
    hendra = _get("usr-hendra", f"{SHEET}?snapshot={snap_id}")
    assert not set(hendra["masked"]) & only_kep


def test_photo_selection_rules(demo: None) -> None:
    q1 = uid("q-2027-1")
    url = f"/api/v1/positions/{A1}/sheet-photos/A"
    risk = legacy_uuid("rr-a1-penyerapan")
    comment = Comment.objects.filter(register_risk_id=risk, author_line=1).first()
    assert comment is not None
    comment.quarter_id = legacy_uuid("q-2027-1")
    comment.save()
    img = Attachment.objects.create(
        owner_kind="comment",
        owner_id=comment.id,
        filename="lokasi.jpg",
        size=10,
        mime_type="image/jpeg",
        scan_status="clean",
        is_confidential=False,
        uploaded_by=user("usr-andi"),
        uploaded_at=clock.now(),
    )
    pdf = Attachment.objects.filter(owner_kind="comment", mime_type="application/pdf").first()
    assert pdf is not None
    ok = client_for("usr-andi").put(
        url, {"quarterId": q1, "attachmentIds": [str(img.id)]}, format="json"
    )
    assert ok.status_code == 204, ok.json()
    assert SheetPhotoSelection.objects.get(section="A").attachment_ids == [str(img.id)]
    bad = client_for("usr-andi").put(
        url, {"quarterId": q1, "attachmentIds": [str(pdf.id)]}, format="json"
    )
    assert bad.status_code == 422
    many = client_for("usr-andi").put(
        url, {"quarterId": q1, "attachmentIds": [str(img.id)] * 6}, format="json"
    )
    assert many.json()["message"] == "Maksimal 5 foto per bagian"
    other = client_for("usr-hendra").put(url, {"quarterId": q1, "attachmentIds": []}, format="json")
    assert other.status_code == 403
    assert other.json()["message"] == "Foto Bagian A dipilih oleh peserta Lini 1."


def test_find_by_number(demo: None) -> None:
    number = PrintSnapshot.objects.order_by("number").first().number  # type: ignore[union-attr]
    found = client_for("usr-andi").get(f"/api/v1/snapshots?number={number.lower()}")
    assert found.status_code == 200 and found.json()["positionId"] == A1
    hidden = client_for("usr-bambang").get(f"/api/v1/snapshots?number={number}")
    assert hidden.status_code == 404
    assert hidden.json()["message"] == f'Nomor cetak "{number}" tidak ditemukan.'
