"""Visibility rules (PRD §2.7, VIS-1 … VIS-9, INV-16, INV-17). Mirrors
frontend/src/domain/rules/visibility.ts; shared vectors in shared/test-vectors/visibility.json.
These functions decide; selectors filter what they return."""

from collections.abc import Iterable
from typing import Any

from .access import Db, has_permission, holdings_of

Row = dict[str, Any]

REDACTED = "[disamarkan]"
REDACTED_FILE = "[konfidensial]"


def viewer_for(db: Db, user_id: str, today: str, blind_view_granted: bool = False) -> Row:
    holdings = holdings_of(db, user_id, today)
    return {
        "user_id": user_id,
        "held_position_ids": [h["position_id"] for h in holdings],
        "lini3_position_ids": [h["position_id"] for h in holdings if h["line"] == 3],
        "can_see_confidential": has_permission(db, user_id, 10, today),
        "blind_view_granted": blind_view_granted and has_permission(db, user_id, 24, today),
    }


def opened_lini3(results: Iterable[Row], risk_quarter_id: str) -> set[str]:
    """Lini 3 positions whose result for this risk-quarter has opened."""
    return {r["lini3_position_id"] for r in results if r["risk_quarter_id"] == risk_quarter_id}


def is_late_directorate(viewer: Row, opened: set[str], expected: list[str]) -> bool:
    """VIS-9: while any Lini 3 position the viewer holds that assesses the risk-quarter has no
    opened result, the viewer sees no other assessment, result, explanation or marker."""
    return any(p in expected and p not in opened for p in viewer["lini3_position_ids"])


def can_see_assessment(viewer: Row, assessment: Row, opened: set[str], expected: list[str]) -> bool:
    """Score, predicate, note and attachments of one assessment (VIS-1, 2, 5, 9)."""
    if assessment["assessor_position_id"] in viewer["held_position_ids"]:
        return True
    if viewer["blind_view_granted"]:
        return True
    if is_late_directorate(viewer, opened, expected):
        return False
    if assessment["assessor_line"] == 3:
        return assessment["assessor_position_id"] in opened
    # Lini 1: visible once any result for the risk-quarter has opened (VIS-2).
    return len(opened) > 0


def can_see_result(viewer: Row, opened: set[str], expected: list[str]) -> bool:
    if viewer["blind_view_granted"]:
        return True
    return not is_late_directorate(viewer, opened, expected)


def can_see_attachment(viewer: Row, attachment: Row) -> bool:
    """VIS-3 / INV-17: confidential files only with permission 10."""
    return not attachment["is_confidential"] or bool(viewer["can_see_confidential"])
