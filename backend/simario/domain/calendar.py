"""Calendar rules (PRD §2.5). Mirrors frontend/src/domain/calendar.ts; shared vectors in
shared/test-vectors/calendar.json."""

from collections.abc import Sequence
from typing import Any


def quarter_containing(quarters: Sequence[dict[str, Any]], day: str) -> dict[str, Any] | None:
    """The quarter (of any fiscal year present) whose range contains `day` (YYYY-MM-DD)."""
    return next((q for q in quarters if q["starts_on"] <= day <= q["ends_on"]), None)
