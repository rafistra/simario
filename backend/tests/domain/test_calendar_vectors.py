from typing import Any

import pytest

from simario.domain.calendar import (
    add_workdays,
    default_quarters,
    lateness_at,
    quarter_containing,
    quarter_problems,
)
from tests.vectors import load_vectors

VECTORS = load_vectors("calendar")


@pytest.mark.parametrize("case", VECTORS["quarterContaining"], ids=lambda c: c["name"])
def test_quarter_containing(case: dict[str, Any]) -> None:
    q = quarter_containing(case["input"]["quarters"], case["input"]["day"])
    assert (q["id"] if q else None) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["defaultQuarters"], ids=lambda c: c["name"])
def test_default_quarters(case: dict[str, Any]) -> None:
    assert default_quarters(**case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["addWorkdays"], ids=lambda c: c["name"])
def test_add_workdays(case: dict[str, Any]) -> None:
    assert add_workdays(**case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["latenessAt"], ids=lambda c: c["name"])
def test_lateness_at(case: dict[str, Any]) -> None:
    assert lateness_at(**case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["quarterProblems"], ids=lambda c: c["name"])
def test_quarter_problems(case: dict[str, Any]) -> None:
    # `field` values stay the client's camelCase names (the API sends them as data).
    assert quarter_problems(**case["input"]) == case["expected"]
