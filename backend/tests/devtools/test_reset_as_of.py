"""Demo reset at an earlier moment (prototype seed/asOf.ts): later data is removed or rolled
back."""

import pytest

from simario.assessments.comparisons import run_comparisons
from simario.assessments.models import Assessment, ComparisonResult, RiskQuarter
from simario.board.models import Comment
from simario.calendar.models import Quarter
from simario.core import clock
from simario.devtools.seed import legacy_uuid, load_demo

Q1 = legacy_uuid("q-2027-1")


@pytest.mark.django_db
def test_reset_to_18_march_rolls_back_tw1() -> None:
    load_demo(clock.parse_local("2027-03-18T09:00"))
    assert not ComparisonResult.objects.filter(risk_quarter__quarter_id=Q1).exists()
    cutoff = clock.parse_local("2027-03-18T09:00")
    assert not Assessment.objects.filter(finalised_at__gt=cutoff).exists()
    assert not Assessment.objects.filter(updated_at__gt=cutoff).exists()
    assert not Comment.objects.filter(created_at__gt=cutoff).exists()
    assert set(
        RiskQuarter.objects.filter(quarter_id=Q1).values_list("comparison_status", flat=True)
    ) == {"waiting"}
    assert not RiskQuarter.objects.filter(quarter_id=Q1, recurring=True).exists()
    # TW II had not started: its band version is not fixed yet and it has no risk-quarters.
    assert Quarter.objects.get(pk=legacy_uuid("q-2027-2")).score_band_version_id is None
    assert not RiskQuarter.objects.filter(quarter_id=legacy_uuid("q-2027-2")).exists()


@pytest.mark.django_db
def test_partial_opening_reproducible_after_reset() -> None:
    load_demo(clock.parse_local("2027-04-02T23:00"))
    before = ComparisonResult.objects.filter(risk_quarter__quarter_id=Q1).count()
    run_comparisons(clock.parse_local("2027-04-03T00:00"))
    assert ComparisonResult.objects.filter(risk_quarter__quarter_id=Q1).count() == before + 6
    statuses = set(
        RiskQuarter.objects.filter(
            quarter_id=Q1, register_risk__register__position_id=legacy_uuid("pos-ppk-a1")
        ).values_list("comparison_status", flat=True)
    )
    assert "partial" in statuses
