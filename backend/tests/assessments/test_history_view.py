from typing import Any

import pytest

from simario.core import clock
from tests.demo import client_for, uid

A1 = uid("pos-ppk-a1")
URL = f"/api/v1/positions/{A1}/history/2027"


def _history(persona: str, url: str = URL) -> dict[str, Any]:
    res = client_for(persona).get(url)
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def test_history_matrix_and_cross_year(demo: None) -> None:
    body = _history("usr-andi")
    assert body["published"] and body["years"] == [2027, 2026]
    assert len(body["quarters"]) == 4 and len(body["mutu"]) == 4
    row = body["rows"][0]
    assert len(row["cells"]) == 4
    assert row["cells"][0]["state"] == "open" and row["cells"][1]["state"] == "waiting"
    assert any(r["otherYears"] for r in body["rows"])
    assert "score" not in body["rows"][0]["cells"][0]["chips"][0]["assessment"]
    assert body["mutu"][0]["anyOpened"] is True


def test_history_late_directorate(demo: None) -> None:
    """VIS-9: before PAI's TW I results opened, Maya sees TW I as waiting."""
    clock.set_now(clock.parse_local("2027-03-20T09:00"))
    body = _history("usr-maya")
    assert all(r["cells"][0]["state"] in ("waiting", "none") for r in body["rows"])
    assert body["mutu"][0]["anyOpened"] is False


def test_history_scope(demo: None) -> None:
    assert client_for("usr-bambang").get(URL).status_code == 403


@pytest.mark.django_db
def test_history_masks_a_risk_still_waiting_for_the_viewers_own_result() -> None:
    """VIS-9 at a partial opening: KEP's result for a risk is open, PAI's is not. Maya sees the
    cell waiting with nothing in it, Hendra sees it open, and Maya's Lembar Mutu leaves it out."""
    from simario.assessments.comparisons import run_comparisons
    from simario.assessments.models import ComparisonResult
    from simario.devtools.seed import legacy_uuid, load_demo

    load_demo(clock.parse_local("2027-04-02T23:00"))
    run_comparisons(clock.parse_local("2027-04-03T00:00"))
    clock.set_now(clock.parse_local("2027-04-03T09:00"))
    kep, pai = legacy_uuid("pos-kepatuhan"), legacy_uuid("pos-pai")
    q1 = legacy_uuid("q-2027-1")
    open_kep = set(
        ComparisonResult.objects.filter(
            lini3_position_id=kep, risk_quarter__quarter_id=q1
        ).values_list("risk_quarter__register_risk_id", flat=True)
    )
    open_pai = set(
        ComparisonResult.objects.filter(
            lini3_position_id=pai, risk_quarter__quarter_id=q1
        ).values_list("risk_quarter__register_risk_id", flat=True)
    )
    only_kep = {str(r) for r in open_kep - open_pai}
    assert only_kep, "the reset must give a risk opened for KEP only"
    maya = _history("usr-maya")
    hendra = _history("usr-hendra")
    for body, state in ((maya, "waiting"), (hendra, "open")):
        cells = [r["cells"][0] for r in body["rows"] if r["risk"]["id"] in only_kep]
        assert cells and all(c["state"] == state for c in cells)
    for row in maya["rows"]:
        if row["risk"]["id"] in only_kep:
            assert row["cells"][0]["chips"] == [] and row["cells"][0]["summary"] is None
    total_maya = maya["mutu"][0]["sesuai"] + maya["mutu"][0]["tidakSesuai"]
    total_hendra = hendra["mutu"][0]["sesuai"] + hendra["mutu"][0]["tidakSesuai"]
    assert total_maya < total_hendra
