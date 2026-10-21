"""Comparison result for one Lini 3 position (PRD FR-NIL-007, FR-NIL-008, RB-NIL-003,
RB-NIL-006). Mirrors frontend/src/domain/rules/comparison.ts; shared vectors in
shared/test-vectors/assessment.json."""

from typing import Any

from .calendar import add_workdays

Row = dict[str, Any]

PREDICATE_RANK = {"kurang": 0, "cukup": 1, "terkendali": 2}


def compare_assessments(lini1: Row | None, lini3: Row) -> Row:
    """Predicates are compared, not scores (RB-NIL-003)."""
    incomparable = (
        lini1 is None
        or lini1["status"] == "not_assessed"
        or lini1["not_relevant"]
        or not lini1["predicate"]
        or not lini3["predicate"]
    )
    if incomparable:
        return {
            "result": "incomparable",
            "lini1_higher": False,
            "explanation_required": False,
            "explanation_status": "not_required",
        }
    assert lini1 is not None
    if lini1["predicate"] == lini3["predicate"]:
        return {
            "result": "sesuai",
            "lini1_higher": False,
            "explanation_required": False,
            "explanation_status": "not_required",
        }
    higher = PREDICATE_RANK[lini1["predicate"]] > PREDICATE_RANK[lini3["predicate"]]
    # Mandatory only when Lini 1 is more optimistic (RB-NIL-006); optional otherwise.
    return {
        "result": "tidak_sesuai",
        "lini1_higher": higher,
        "explanation_required": higher,
        "explanation_status": "pending" if higher else "optional",
    }


def explanation_due_on(opened_at: str, workdays: int) -> str:
    """Explanation deadline: opened_at + explanation_workdays, Monday–Friday (§2.5)."""
    return add_workdays(opened_at[:10], workdays)
