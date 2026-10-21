from typing import Any

import pytest

from simario.domain import assessment as a
from simario.domain import board as b
from simario.domain import comparison as c
from tests.vectors import load_vectors

V = load_vectors("assessment")


def _q(db: Any, qid: str) -> Any:
    return next(q for q in db["quarters"] if q["id"] == qid)


def _year(db: Any, rq_id: str) -> int:
    rq = next(x for x in db["risk_quarters"] if x["id"] == rq_id)
    return int(_q(db, rq["quarter_id"])["fiscal_year"])


def _q27(db: Any) -> list[Any]:
    return [q for q in db["quarters"] if q["fiscal_year"] >= 2026]


@pytest.mark.parametrize("case", V["windowOpen"], ids=lambda c: c["name"])
def test_window_open(case: dict[str, Any]) -> None:
    i = case["input"]
    got = {
        q["id"]: [a.window_open(q, 1, i["today"]), a.window_open(q, 3, i["today"])]
        for q in _q27(i["db"])
    }
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["bandVersionFor"], ids=lambda c: c["name"])
def test_band_version_for(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    assert {q["id"]: a.band_version_for(db, q) for q in db["quarters"]} == case["expected"]


@pytest.mark.parametrize("case", V["predicateIn"], ids=lambda c: c["name"])
def test_predicate_in(case: dict[str, Any]) -> None:
    i = case["input"]
    q = _q(i["db"], i["quarter_id"])
    assert [a.predicate_in(i["db"], q, s) for s in i["scores"]] == case["expected"]


@pytest.mark.parametrize("case", V["optionLabelOf"], ids=lambda c: c["name"])
def test_option_label_of(case: dict[str, Any]) -> None:
    i = case["input"]
    got = {v: [a.option_label_of(i["db"], v, s) for s in i["values"]] for v in case["expected"]}
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["quarterRisks"], ids=lambda c: c["name"])
def test_quarter_risks(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    got = {}
    for key in case["expected"]:
        pos, qid = key.split("|")
        got[key] = [rq["id"] for _, rq in a.quarter_risks(db, pos, _q(db, qid))]
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["assessmentFrozen"], ids=lambda c: c["name"])
def test_assessment_frozen(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {x["id"]: a.assessment_frozen(db, x, i["at"]) for x in db["assessments"]}
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["comparisonStatusAt"], ids=lambda c: c["name"])
def test_comparison_status_at(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {rq["id"]: a.comparison_status_at(db, rq, i["at"]) for rq in db["risk_quarters"]}
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["finaliseLateness"], ids=lambda c: c["name"])
def test_finalise_lateness(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {
        q["id"]: [a.finalise_lateness(db, q, 1, i["at"]), a.finalise_lateness(db, q, 3, i["at"])]
        for q in _q27(db)
    }
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["explanationLateness"], ids=lambda c: c["name"])
def test_explanation_lateness(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {
        r["id"]: a.explanation_lateness(db, r, i["at"], _year(db, r["risk_quarter_id"]))
        for r in db["results"]
    }
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["pendingExplanationLateness"], ids=lambda c: c["name"])
def test_pending_explanation_lateness(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {
        r["id"]: a.pending_explanation_lateness(db, r, i["today"], _year(db, r["risk_quarter_id"]))
        for r in db["results"]
    }
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["lini3Overdue"], ids=lambda c: c["name"])
def test_lini3_overdue(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {}
    for rq in db["risk_quarters"]:
        q = _q(db, rq["quarter_id"])
        for p in b.expected_lini3(db, q["id"]):
            x = next(
                (
                    y
                    for y in db["assessments"]
                    if y["risk_quarter_id"] == rq["id"] and y["assessor_position_id"] == p
                ),
                None,
            )
            got[f"{rq['id']}|{p}"] = a.lini3_overdue(q, x, i["today"])
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["previousRiskQuarter"], ids=lambda c: c["name"])
def test_previous_risk_quarter(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    got = {}
    for rq in db["risk_quarters"]:
        prev = a.previous_risk_quarter(db, rq)
        got[rq["id"]] = prev["id"] if prev else None
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["isRecurring"], ids=lambda c: c["name"])
def test_is_recurring(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    assert {rq["id"]: a.is_recurring(db, rq) for rq in db["risk_quarters"]} == case["expected"]


@pytest.mark.parametrize("case", V["evaluateOpening"], ids=lambda c: c["name"])
def test_evaluate_opening(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {rq["id"]: a.evaluate_opening(db, rq, i["at"]) for rq in db["risk_quarters"]}
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["compareAssessments"], ids=lambda c: c["name"])
def test_compare_assessments(case: dict[str, Any]) -> None:
    pair = case["input"]["pair"]
    assert c.compare_assessments(pair["lini1"], pair["lini3"]) == case["expected"]
