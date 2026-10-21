"""Score → predicate (PRD FR-MST-007, INV-3). Mirrors frontend/src/domain/scoreBands.ts; both
sides run shared/test-vectors/score-bands.json. Bands: lower bound exclusive, upper inclusive;
the first band includes 0."""

from collections.abc import Sequence
from typing import Literal, TypedDict

Predicate = Literal["kurang", "cukup", "terkendali"]


class BandLike(TypedDict):
    lower_exclusive: float | None
    upper_inclusive: float
    order: int
    predicate: Predicate


# "from" is a keyword, so the TypedDict uses the functional form.
BandProblem = TypedDict(
    "BandProblem",
    {"kind": Literal["gap", "overlap", "range"], "from": float, "to": float},
)


def predicate_for(score: float, bands: Sequence[BandLike]) -> Predicate | None:
    for band in sorted(bands, key=lambda b: b["order"]):
        lower = band["lower_exclusive"]
        above_lower = score >= 0 if lower is None else score > lower
        if above_lower and score <= band["upper_inclusive"]:
            return band["predicate"]
    return None


def validate_bands(bands: Sequence[BandLike]) -> list[BandProblem]:
    """Bands must cover 0–4 with no gap or overlap (INV-3), at one-decimal precision."""
    ordered = sorted(bands, key=lambda b: b["order"])
    if not ordered:
        return [{"kind": "range", "from": 0, "to": 4}]
    problems: list[BandProblem] = []
    first_lower = ordered[0]["lower_exclusive"]
    if first_lower is not None and first_lower >= 0:
        problems.append({"kind": "gap", "from": 0, "to": first_lower})
    for prev, band in zip(ordered, ordered[1:], strict=False):
        prev_upper = prev["upper_inclusive"]
        lower = band["lower_exclusive"] or 0
        if lower > prev_upper:
            problems.append({"kind": "gap", "from": prev_upper, "to": lower})
        if lower < prev_upper:
            problems.append({"kind": "overlap", "from": lower, "to": prev_upper})
    last = ordered[-1]["upper_inclusive"]
    if last != 4:
        problems.append({"kind": "gap" if last < 4 else "range", "from": last, "to": 4})
    return problems
