from typing import Any

import pytest

from simario.domain.register import (
    assessed_in_quarter,
    complete_stages,
    deactivation_quarter,
    register_gaps,
)
from tests.vectors import load_vectors

VECTORS = load_vectors("register")


@pytest.mark.parametrize("case", VECTORS["registerGaps"], ids=lambda c: c["name"])
def test_register_gaps(case: dict[str, Any]) -> None:
    assert register_gaps(case["input"]["db"], case["input"]["register_id"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["completeStages"], ids=lambda c: c["name"])
def test_complete_stages(case: dict[str, Any]) -> None:
    assert complete_stages(case["input"]["db"], case["input"]["register_id"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["deactivationQuarter"], ids=lambda c: c["name"])
def test_deactivation_quarter(case: dict[str, Any]) -> None:
    quarters = case["input"]["quarters"]
    current = next(q for q in quarters if q["id"] == case["input"]["current_id"])
    got = deactivation_quarter(quarters, current)
    assert (got["id"] if got else None) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["assessedInQuarter"], ids=lambda c: c["name"])
def test_assessed_in_quarter(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    risk = next(r for r in db["risks"] if r["id"] == case["input"]["risk_id"])
    quarters = {q["id"]: q for q in db["quarters"]}
    got = {qid: assessed_in_quarter(db, risk, quarters[qid]) for qid in case["expected"]}
    assert got == case["expected"]
