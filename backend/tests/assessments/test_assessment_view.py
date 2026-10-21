import json
from typing import Any

from simario.assessments.models import Assessment, ComparisonResult
from simario.audit.models import AuditLog
from simario.board.models import Attachment
from simario.core import clock
from simario.devtools.seed import legacy_uuid
from tests.demo import client_for, uid, user

A1 = uid("pos-ppk-a1")
KEP = uid("pos-kepatuhan")
PAI = uid("pos-pai")


def _page(persona: str, tw: int, query: str = "") -> dict[str, Any]:
    res = client_for(persona).get(f"/api/v1/positions/{A1}/assessments/2027/{tw}{query}")
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def _cells(body: dict[str, Any], position_id: str) -> list[dict[str, Any]]:
    return [c for r in body["rows"] for c in r["cells"] if c["positionId"] == position_id]


def test_modes_and_window(demo: None) -> None:
    andi = _page("usr-andi", 1)
    assert andi["mode"] == "lini1" and andi["ownPositionId"] == A1 and andi["published"]
    assert andi["rows"] and andi["options"] and andi["bandVersionNumber"] == 1
    hendra = _page("usr-hendra", 1)
    assert hendra["mode"] == "lini3" and hendra["ownPositionId"] == KEP
    assert _page("usr-siti", 1)["mode"] == "reader"
    tw3 = _page("usr-andi", 3)
    assert tw3["windowOpen"] is False and tw3["opensOn"] == "2027-09-01"
    assert (
        client_for("usr-bambang").get(f"/api/v1/positions/{A1}/assessments/2027/1").status_code
        == 403
    )


def test_inv16_blind_drafts_never_served(demo: None) -> None:
    """INV-16 / VIS-1: Hendra's TW II drafts reach nobody else — not even option labels."""
    drafts = Assessment.objects.filter(
        assessor_position_id=legacy_uuid("pos-kepatuhan"),
        risk_quarter__quarter__number=2,
        status="draft",
    )
    assert drafts.exists()
    labels = {d.score for d in drafts if d.score is not None}
    for persona in ("usr-maya", "usr-andi", "usr-siti", "usr-admin"):
        body = _page(persona, 2)
        for cell in _cells(body, KEP):
            assert cell["assessment"] is None and cell["visible"] is False
            assert cell["selectedValue"] is None
        assert body["blind"]["granted"] is False
    own = _page("usr-hendra", 2)
    assert any(c["assessment"] for c in _cells(own, KEP))
    assert {c["selectedValue"] for c in _cells(own, KEP) if c["selectedValue"] is not None} <= {
        float(x) for x in labels
    }


def test_blind_view_needs_permission_24_and_is_logged(demo: None) -> None:
    logs = AuditLog.objects.filter(action="lihat_penilaian_sebelum_dibuka")
    before = logs.count()
    andi = _page("usr-andi", 2, "?blind=1")
    assert andi["blind"]["granted"] is False
    assert all(c["assessment"] is None for c in _cells(andi, KEP))
    assert logs.count() == before
    admin = _page("usr-admin", 2, "?blind=1")
    assert admin["blind"] == {"allowed": True, "granted": True}
    assert any(c["assessment"] for c in _cells(admin, KEP))
    assert logs.count() == before + 1
    log = logs.order_by("-at").first()
    assert log is not None
    assert log.actor == user("usr-admin") and log.after == {"position": A1}


def test_inv17_confidential_evidence_hidden(demo: None) -> None:
    result = ComparisonResult.objects.filter(
        lini3_position_id=legacy_uuid("pos-kepatuhan"),
        risk_quarter__quarter__number=1,
        risk_quarter__quarter__fiscal_year=2027,
    ).first()
    assert result is not None
    a = Assessment.objects.get(
        risk_quarter=result.risk_quarter, assessor_position_id=legacy_uuid("pos-kepatuhan")
    )
    Attachment.objects.create(
        owner_kind="assessment",
        owner_id=a.id,
        filename="temuan-rahasia.pdf",
        size=10,
        mime_type="application/pdf",
        scan_status="clean",
        is_confidential=True,
        uploaded_by=user("usr-hendra"),
        uploaded_at=clock.now(),
    )
    andi = client_for("usr-andi").get(f"/api/v1/positions/{A1}/assessments/2027/1")
    assert "temuan-rahasia.pdf" not in json.dumps(andi.json())
    cell = next(
        c
        for r in andi.json()["rows"]
        if r["rq"]["id"] == str(result.risk_quarter_id)
        for c in r["cells"]
        if c["positionId"] == KEP
    )
    assert cell["confidentialHidden"] == 1 and cell["attachments"] == []
    hendra = _page("usr-hendra", 1)
    assert "temuan-rahasia.pdf" in json.dumps(hendra)


def test_late_directorate_sees_nothing_of_others(demo: None) -> None:
    """VIS-9: before PAI's own result opened, Maya sees no Lini 1 or KEP assessment."""
    clock.set_now(clock.parse_local("2027-03-20T09:00"))
    body = _page("usr-maya", 1)
    for r in body["rows"]:
        for c in r["cells"]:
            if c["positionId"] != PAI:
                assert c["assessment"] is None or c["assessment"]["status"] in (
                    "final",
                    "not_assessed",
                )
            assert c["result"] is None or c["positionId"] != KEP or r["summary"] != "waiting"


def test_explanation_drafts_only_for_lini1(demo: None) -> None:
    r = (
        ComparisonResult.objects.filter(result="tidak_sesuai")
        .exclude(explanation_status="sent")
        .first()
    )
    if r is None:
        return
    r.explanation_reason = "draf alasan"
    r.save()
    assert "draf alasan" in json.dumps(_page("usr-andi", r.risk_quarter.quarter.number))
    for persona in ("usr-hendra", "usr-siti", "usr-maya"):
        assert "draf alasan" not in json.dumps(_page(persona, r.risk_quarter.quarter.number))


def test_finalise_preview(demo: None) -> None:
    res = client_for("usr-andi").get(
        f"/api/v1/positions/{A1}/assessments/2027/2/finalise-preview?assessorPositionId={A1}"
    )
    assert res.status_code == 200
    assert set(res.json()) == {"toFinalise", "unscored", "noEvidence", "missingReason"}
