"""`sheet_freeze` (FR-LBR-009) and its event triggers (U-07)."""

from simario.assessments.models import ComparisonResult
from simario.board.models import Comment
from simario.core import clock, scheduler
from simario.devtools.seed import legacy_uuid
from simario.sheets.models import PrintSnapshot
from simario.sheets.services import run_sheet_freeze
from tests.demo import client_for, uid, user

A1, Q1 = legacy_uuid("pos-ppk-a1"), legacy_uuid("q-2027-1")


def _autos() -> list[PrintSnapshot]:
    return list(
        PrintSnapshot.objects.filter(position_id=A1, quarter_id=Q1)
        .exclude(trigger="print")
        .order_by("kind", "version")
    )


def test_freeze_idempotent_and_superseded(demo: None) -> None:
    """21 Apr 2027: the TW I explanations are past due + tolerance → Versi 1 for PPK A-1."""
    when = clock.parse_local("2027-04-21T09:00")
    scheduler.run_all(when)
    first = _autos()
    assert {(s.kind, s.version) for s in first} == {("komunikasi", 1), ("mutu", 1)}
    assert all(not s.is_provisional and s.trigger == "auto_freeze" for s in first)
    scheduler.run_all(clock.parse_local("2027-05-30T09:00"))
    assert len(_autos()) == 2
    # New content (a Langkah dated before the run) → Versi 2, and Versi 1 points to it.
    Comment.objects.create(
        register_risk_id=legacy_uuid("rr-a1-penyerapan"),
        author=user("usr-andi"),
        author_line=1,
        acting_as="pejabat",
        acting_position_id=A1,
        quarter_id=Q1,
        body="Langkah tambahan",
        is_step=True,
        created_at=clock.parse_local("2027-05-31T08:00"),
    )
    run_sheet_freeze(clock.parse_local("2027-05-31T09:00"))
    autos = _autos()
    assert {(s.kind, s.version) for s in autos} >= {("komunikasi", 2), ("mutu", 2)}
    v1 = next(s for s in autos if s.kind == "komunikasi" and s.version == 1)
    v2 = next(s for s in autos if s.kind == "komunikasi" and s.version == 2)
    assert v1.superseded_by_id == v2.id
    assert v2.number.endswith("/002") or v2.number > v1.number


def test_sending_the_last_explanation_freezes(demo: None) -> None:
    pending = ComparisonResult.objects.filter(
        risk_quarter__quarter_id=Q1,
        risk_quarter__register_risk__register__position_id=A1,
        explanation_required=True,
    ).exclude(explanation_status="sent")
    ids = [str(r.id) for r in pending]
    for r in pending:
        r.explanation_reason = "Kendala"
        r.explanation_plan = "Rencana"
        r.save()
    assert not _autos()
    res = client_for("usr-andi").post(
        f"/api/v1/positions/{uid('pos-ppk-a1')}/explanations/send",
        {"resultIds": ids},
        format="json",
    )
    assert res.status_code == 200, res.json()
    assert {s.version for s in _autos()} == {1}
