"""The `comparisons` task (§2.5, FR-NIL-007/009/011) on the demo seed, TW II 2027."""

import threading

import pytest
from django.db import connection

from simario.assessments import services
from simario.assessments.comparisons import run_comparisons
from simario.assessments.models import Assessment, ComparisonResult, RiskQuarter
from simario.core import clock, scheduler
from simario.devtools.seed import legacy_uuid
from simario.notifications.models import Notification
from tests.demo import client_for, uid, user

A1, KEP, PAI = uid("pos-ppk-a1"), uid("pos-kepatuhan"), uid("pos-pai")
Q2 = uid("q-2027-2")
PEMECAHAN = legacy_uuid("rq-rr-a1-pemecahan-q-2027-2")


def _at(when: str) -> None:
    clock.set_now(clock.parse_local(when))


def _finalise(persona: str, assessor: str) -> None:
    res = client_for(persona).post(
        f"/api/v1/positions/{A1}/quarters/{Q2}/assessments/{assessor}/finalise"
    )
    assert res.status_code == 200, res.json()


def _cell(persona: str, rq: object, assessor: str, score: float) -> None:
    res = client_for(persona).patch(
        f"/api/v1/risk-quarters/{rq}/assessments/{assessor}", {"score": score}, format="json"
    )
    assert res.status_code == 204, res.json()


def test_partial_opening_after_the_lini3_deadline(demo: None) -> None:
    """KEP finalised, PAI and Lini 1 did not: after 2 Jul KEP's results open, Lini 1 is closed
    as "Tidak dinilai Lini 1", the comparison is partial, and Berulang is detected."""
    _at("2027-06-30T09:00")
    _finalise("usr-hendra", KEP)
    assert not ComparisonResult.objects.filter(risk_quarter_id=PEMECAHAN).exists()
    run_comparisons(clock.parse_local("2027-07-03T00:00"))
    rq = RiskQuarter.objects.get(pk=PEMECAHAN)
    assert rq.comparison_status == "partial" and rq.first_opened_at is not None
    r = ComparisonResult.objects.get(risk_quarter=rq)
    assert str(r.lini3_position_id) == KEP and r.result == "incomparable"
    l1 = Assessment.objects.get(risk_quarter=rq, assessor_line=1)
    assert l1.status == "not_assessed"
    assert rq.recurring is True
    andi = Notification.objects.filter(user=user("usr-andi"))
    assert andi.filter(kind="comparison_opened").exists()
    assert andi.filter(kind="recurring", event_key=f"recurring:{rq.id}").exists()
    maya = Notification.objects.filter(user=user("usr-maya"), kind="recurring")
    assert not maya.filter(event_key=f"recurring:{rq.id}").exists()  # VIS-9


def test_comparisons_idempotent_after_jump(demo: None) -> None:
    _at("2027-06-30T09:00")
    _finalise("usr-hendra", KEP)
    run_comparisons(clock.parse_local("2027-07-03T00:00"))
    results = ComparisonResult.objects.count()
    notes = Notification.objects.count()
    for when in ("2027-07-03T00:00", "2027-08-15T09:00", "2027-12-01T09:00"):
        scheduler.run_all(clock.parse_local(when))
    assert ComparisonResult.objects.count() == results
    assert Notification.objects.filter(kind__in=("comparison_opened", "recurring")).count() == (
        Notification.objects.filter(kind__in=("comparison_opened", "recurring"))
        .filter(created_at__lte=clock.parse_local("2027-07-03T00:00"))
        .count()
    )
    assert Notification.objects.count() >= notes


def test_full_opening_on_the_last_finalise(demo: None) -> None:
    _at("2027-06-02T09:00")
    for rq in RiskQuarter.objects.filter(
        quarter_id=legacy_uuid("q-2027-2"),
        register_risk__register__position_id=legacy_uuid("pos-ppk-a1"),
    ):
        _cell("usr-andi", rq.id, A1, 3)
        _cell("usr-hendra", rq.id, KEP, 3)
        _cell("usr-maya", rq.id, PAI, 3)
    _finalise("usr-andi", A1)
    _finalise("usr-hendra", KEP)
    assert not ComparisonResult.objects.filter(risk_quarter_id=PEMECAHAN).exists()
    _finalise("usr-maya", PAI)
    rq = RiskQuarter.objects.get(pk=PEMECAHAN)
    assert rq.comparison_status == "open"
    assert set(
        ComparisonResult.objects.filter(risk_quarter=rq).values_list("result", flat=True)
    ) == {"sesuai"}


@pytest.mark.django_db(transaction=True)
def test_finalise_locks_risk_quarter() -> None:
    """Two directorates finalising at the same moment open each result exactly once."""
    from simario.devtools.seed import load_demo

    load_demo()
    _at("2027-06-02T09:00")
    rqs = list(
        RiskQuarter.objects.filter(
            quarter_id=legacy_uuid("q-2027-2"),
            register_risk__register__position_id=legacy_uuid("pos-ppk-a1"),
        )
    )
    for rq in rqs:
        _cell("usr-andi", rq.id, A1, 3)
        _cell("usr-hendra", rq.id, KEP, 3)
        _cell("usr-maya", rq.id, PAI, 3)
    _finalise("usr-andi", A1)
    errors: list[BaseException] = []

    def run(persona: str, assessor: str) -> None:
        try:
            services.finalise(user(persona), A1, Q2, assessor)
        except BaseException as exc:  # pragma: no cover - reported below
            errors.append(exc)
        finally:
            connection.close()

    threads = [
        threading.Thread(target=run, args=("usr-hendra", KEP)),
        threading.Thread(target=run, args=("usr-maya", PAI)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    for rq in rqs:
        assert ComparisonResult.objects.filter(risk_quarter=rq).count() == 2
        rq.refresh_from_db()
        assert rq.comparison_status == "open"
