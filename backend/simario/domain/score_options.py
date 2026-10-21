"""Statements assessors choose (PRD v2.8). Mirrors validateOptions/sortOptions in
frontend/src/domain/scoreBands.ts; shared vectors in shared/test-vectors/score-bands.json."""

import math
from collections.abc import Sequence
from typing import Any

from .score_bands import BandLike, predicate_for


def _tenths(n: float) -> int:
    return math.floor(n * 10 + 0.5)


def _finite(v: Any) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool) and math.isfinite(v)


def sort_options(options: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Dropdown order: worst (lowest value) to best."""
    return sorted(options, key=lambda o: o["value"])


def validate_options(
    options: Sequence[dict[str, Any]], bands: Sequence[BandLike]
) -> list[dict[str, Any]]:
    """Labels and values unique, values 0–4 with one decimal, every predicate has a statement."""
    problems: list[dict[str, Any]] = []
    labels: set[str] = set()
    values: set[int] = set()
    for o in options:
        label = o["label"].strip().lower()
        if not label:
            problems.append({"kind": "empty-label", "option_id": o["id"]})
        elif label in labels:
            problems.append({"kind": "duplicate-label", "option_id": o["id"]})
        else:
            labels.add(label)
        v = o["value"]
        valid = _finite(v) and 0 <= v <= 4 and _tenths(v) == v * 10
        if not valid:
            problems.append({"kind": "out-of-range", "option_id": o["id"]})
        elif _tenths(v) in values:
            problems.append({"kind": "duplicate-value", "option_id": o["id"]})
        else:
            values.add(_tenths(v))
    for b in sorted(bands, key=lambda x: x["order"]):
        covered = any(
            _finite(o["value"]) and predicate_for(o["value"], bands) == b["predicate"]
            for o in options
        )
        if not covered:
            problems.append({"kind": "band-uncovered", "predicate": b["predicate"]})
    return problems
