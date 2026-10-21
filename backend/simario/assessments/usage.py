"""How quarter assessments bear on calendar administration — read by fiscal-year, quarter and
archive checks (FR-ADM-007, §2.5). Ports the assessment parts of
frontend/src/data/api/calendar.ts."""

import datetime as dt
import uuid

from simario.calendar.models import Quarter
from simario.domain import assessment as rules

from .comparisons import run_comparisons
from .models import Assessment, ComparisonResult, RiskQuarter
from .selectors import assessment_db


def assessor_has_finalised(quarter_id: uuid.UUID, position_id: uuid.UUID) -> bool:
    """Whether the Lini 3 position finalised any assessment in the quarter."""
    return Assessment.objects.filter(
        risk_quarter__quarter_id=quarter_id, assessor_position_id=position_id, status="final"
    ).exists()


def drop_assessor(quarter_id: uuid.UUID, position_id: uuid.UUID, at: dt.datetime) -> None:
    """Removes the excluded position's assessments and re-evaluates comparison openings."""
    Assessment.objects.filter(
        risk_quarter__quarter_id=quarter_id, assessor_position_id=position_id
    ).delete()
    run_comparisons(
        at, RiskQuarter.objects.filter(quarter_id=quarter_id).values_list("id", flat=True)
    )


def entered_before(quarter_id: uuid.UUID, line: int, day: dt.date) -> int:
    """Assessments of `line` in the quarter last saved before `day` (window moves)."""
    return Assessment.objects.filter(
        risk_quarter__quarter_id=quarter_id, assessor_line=line, updated_at__date__lt=day
    ).count()


def tw4_not_fully_open(fiscal_year: int) -> int:
    """TW IV risks of Lini 1 positions whose comparison has not fully opened."""
    tw4 = Quarter.objects.filter(fiscal_year_id=fiscal_year, number=4).first()
    if tw4 is None:
        return 0
    db = assessment_db()
    q = next(x for x in db["quarters"] if x["id"] == str(tw4.id))
    lini1_types = {t["id"] for t in db["position_types"] if t["line"] == 1}
    return sum(
        1
        for p in db["positions"]
        if p["position_type_id"] in lini1_types
        for _, rq in rules.quarter_risks(db, p["id"], q)
        if rq["comparison_status"] != "open"
    )


def explanation_due_dates(fiscal_year: int) -> list[dt.date]:
    """Due dates of mandatory explanations of the year not yet sent or closed."""
    return [
        d
        for d in ComparisonResult.objects.filter(
            risk_quarter__quarter__fiscal_year_id=fiscal_year,
            explanation_required=True,
            explanation_due_on__isnull=False,
        )
        .exclude(explanation_status__in=("sent", "not_sent"))
        .values_list("explanation_due_on", flat=True)
        if d is not None
    ]
