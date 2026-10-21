"""How quarter assessments bear on calendar administration — read by fiscal-year, quarter and
archive checks (FR-ADM-007, §2.5).

B2: assessments still live in the browser, so these answer "nothing yet" (U-21 in
docs/04_risk_and_debt.md). B5 implements them over the assessment models with the same
signatures."""

import datetime as dt
import uuid


def assessor_has_finalised(quarter_id: uuid.UUID, position_id: uuid.UUID) -> bool:
    """Whether the Lini 3 position finalised any assessment in the quarter."""
    return False


def drop_assessor(quarter_id: uuid.UUID, position_id: uuid.UUID, at: dt.datetime) -> None:
    """Removes the excluded position's assessments and re-evaluates comparison openings."""
    return None


def entered_before(quarter_id: uuid.UUID, line: int, day: dt.date) -> int:
    """Assessments of `line` in the quarter last saved before `day` (window moves)."""
    return 0


def tw4_not_fully_open(fiscal_year: int) -> int:
    """TW IV risks whose comparison has not fully opened."""
    return 0


def explanation_due_dates(fiscal_year: int) -> list[dt.date]:
    """Due dates of mandatory explanations of the year not yet sent or closed."""
    return []
