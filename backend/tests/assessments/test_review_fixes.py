"""Final review B5 fixes: lock scope, foreign Lini 1 assessors, preview access."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from simario.assessments.comparisons import run_comparisons
from simario.assessments.models import Assessment
from simario.core import clock
from simario.devtools.seed import legacy_uuid
from tests.demo import client_for, uid

A1, A2, KEP = uid("pos-ppk-a1"), uid("pos-ppk-a2"), uid("pos-kepatuhan")
Q2 = uid("q-2027-2")


def test_run_comparisons_locks_risk_quarters_only(demo: None) -> None:
    """FOR UPDATE on a joined query would also lock Quarter and FiscalYear rows (deadlock with
    archive and other finalises)."""
    with CaptureQueriesContext(connection) as ctx:
        run_comparisons(clock.now())
    locks = [q["sql"] for q in ctx.captured_queries if "FOR UPDATE" in q["sql"]]
    assert locks
    assert all("JOIN" not in sql for sql in locks), locks


def test_other_lini1_position_cannot_assess_a_foreign_risk(demo: None) -> None:
    clock.set_now(clock.parse_local("2027-06-02T09:00"))
    rq = legacy_uuid("rq-rr-a1-material-q-2027-2")
    res = client_for("usr-bambang").patch(
        f"/api/v1/risk-quarters/{rq}/assessments/{A2}", {"score": 3}, format="json"
    )
    assert res.status_code == 403
    assert res.json()["message"] == "Tindakan ini hanya untuk pemegang jabatan penilai."
    assert not Assessment.objects.filter(
        risk_quarter_id=rq, assessor_position_id=legacy_uuid("pos-ppk-a2")
    ).exists()
    res = client_for("usr-bambang").post(
        f"/api/v1/positions/{A1}/quarters/{Q2}/assessments/{A2}/finalise"
    )
    assert res.status_code == 403


def test_finalise_preview_needs_the_assessor_holding(demo: None) -> None:
    url = f"/api/v1/positions/{A1}/assessments/2027/2/finalise-preview?assessorPositionId="
    assert client_for("usr-hendra").get(url + A1).status_code == 403
    assert client_for("usr-hendra").get(url + KEP).status_code == 200
    assert client_for("usr-andi").get(url + KEP).status_code == 403
