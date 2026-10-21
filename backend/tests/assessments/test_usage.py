import datetime as dt

from simario.assessments import usage
from simario.assessments.archive import close_assessments
from simario.assessments.models import Assessment, ComparisonResult
from simario.calendar.models import FiscalYear
from simario.core import clock
from simario.devtools.seed import legacy_uuid

Q1, Q2 = legacy_uuid("q-2027-1"), legacy_uuid("q-2027-2")
KEP, PAI = legacy_uuid("pos-kepatuhan"), legacy_uuid("pos-pai")


def test_usage_reads_assessments(demo: None) -> None:
    assert usage.assessor_has_finalised(Q1, KEP) is True
    assert usage.assessor_has_finalised(Q2, KEP) is False
    assert usage.entered_before(Q2, 3, dt.date(2027, 12, 31)) >= 2
    assert usage.entered_before(Q2, 3, dt.date(2027, 1, 1)) == 0
    assert dt.date(2027, 4, 9) in usage.explanation_due_dates(2027)
    assert usage.tw4_not_fully_open(2027) == 0  # TW IV has not started: no risk-quarters yet


def test_drop_assessor_removes_drafts_and_reopens(demo: None) -> None:
    usage.drop_assessor(Q2, KEP, clock.now())
    assert not Assessment.objects.filter(risk_quarter__quarter_id=Q2, assessor_position_id=KEP)


def test_archive_closes_assessments_and_explanations(demo: None) -> None:
    close_assessments(FiscalYear.objects.get(pk=2027), clock.now())
    drafts = Assessment.objects.filter(risk_quarter__quarter_id=Q2, assessor_position_id=KEP)
    assert drafts and all(a.status == "not_assessed" for a in drafts)
    pending = ComparisonResult.objects.filter(
        risk_quarter__quarter__fiscal_year_id=2027, explanation_required=True
    ).exclude(explanation_status="sent")
    assert pending and all(r.explanation_status == "not_sent" for r in pending)
    assert Assessment.objects.filter(
        risk_quarter__quarter_id=Q2, assessor_position_id=PAI, status="not_assessed"
    ).exists()
