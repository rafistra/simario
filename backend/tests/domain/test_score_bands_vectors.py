from typing import Any

import pytest

from simario.domain.score_bands import predicate_for, validate_bands
from tests.vectors import load_vectors

VECTORS = load_vectors("score-bands")


@pytest.mark.parametrize("case", VECTORS["predicateFor"], ids=lambda c: c["name"])
def test_predicate_for(case: dict[str, Any]) -> None:
    assert predicate_for(**case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["validateBands"], ids=lambda c: c["name"])
def test_validate_bands(case: dict[str, Any]) -> None:
    assert validate_bands(**case["input"]) == case["expected"]
