from typing import Any

import pytest

from simario.domain import board as b
from simario.domain import visibility as v
from tests.vectors import load_vectors

BOARD = load_vectors("board")
VIS = load_vectors("visibility")


def _viewer(i: dict[str, Any]) -> dict[str, Any]:
    return v.viewer_for(i["db"], i["user_id"], i["today"])


def _opened(db: Any, rq_id: str, at: str) -> set[str]:
    return v.opened_lini3(b.opened_results(db, rq_id, at), rq_id)


@pytest.mark.parametrize("case", VIS["viewerFor"], ids=lambda c: c["name"])
def test_viewer_for(case: dict[str, Any]) -> None:
    assert _viewer(case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VIS["canSeeAssessment"], ids=lambda c: c["name"])
def test_can_see_assessment(case: dict[str, Any]) -> None:
    i = case["input"]
    db, viewer = i["db"], _viewer(i)
    rqs = {rq["id"]: rq for rq in db["risk_quarters"]}
    got = {}
    for a in db["assessments"]:
        rq = rqs[a["risk_quarter_id"]]
        got[a["id"]] = v.can_see_assessment(
            viewer, a, _opened(db, rq["id"], i["at"]), b.expected_lini3(db, rq["quarter_id"])
        )
    assert got == case["expected"]


@pytest.mark.parametrize("case", VIS["isLateDirectorate"], ids=lambda c: c["name"])
def test_is_late_directorate(case: dict[str, Any]) -> None:
    i = case["input"]
    db, viewer = i["db"], _viewer(i)
    got = {
        rq["id"]: v.is_late_directorate(
            viewer, _opened(db, rq["id"], i["at"]), b.expected_lini3(db, rq["quarter_id"])
        )
        for rq in db["risk_quarters"]
    }
    assert got == case["expected"]


@pytest.mark.parametrize("case", VIS["canSeeAttachment"], ids=lambda c: c["name"])
def test_can_see_attachment(case: dict[str, Any]) -> None:
    i = case["input"]
    viewer = _viewer(i)
    got = {a["id"]: v.can_see_attachment(viewer, a) for a in i["db"]["attachments"]}
    assert got == case["expected"]


@pytest.mark.parametrize("case", BOARD["postingQuarter"], ids=lambda c: c["name"])
def test_posting_quarter(case: dict[str, Any]) -> None:
    i = case["input"]
    q = b.posting_quarter(i["db"], i["fiscal_year"], i["today"])
    assert (q["id"] if q else None) == case["expected"]


def _map_case(rule: str) -> dict[str, Any]:
    case: dict[str, Any] = BOARD[rule][0]
    return case


def test_opened_results() -> None:
    c = _map_case("openedResults")
    db, at = c["input"]["db"], c["input"]["at"]
    got = {
        rq["id"]: [r["id"] for r in b.opened_results(db, rq["id"], at)]
        for rq in db["risk_quarters"]
    }
    assert got == c["expected"]


def test_expected_lini3() -> None:
    c = _map_case("expectedLini3")
    db = c["input"]["db"]
    assert {q["id"]: b.expected_lini3(db, q["id"]) for q in db["quarters"]} == c["expected"]


def test_is_quiet() -> None:
    c = _map_case("isQuiet")
    db = c["input"]["db"]
    q = b.posting_quarter(db, 2027, c["input"]["today"])
    assert {r["id"]: b.is_quiet(db, r, q) for r in db["risks"]} == c["expected"]


def test_last_activity() -> None:
    c = _map_case("lastActivity")
    db = c["input"]["db"]
    assert {r["id"]: b.last_activity(db, r["id"]) for r in db["risks"]} == c["expected"]


def test_related_quarters() -> None:
    c = _map_case("relatedQuarters")
    i = c["input"]
    q = b.posting_quarter(i["db"], 2027, i["today"])
    assert q is not None
    got = {
        r["id"]: [x["id"] for x in b.related_quarters(i["db"], r, q, i["at"])]
        for r in i["db"]["risks"]
    }
    assert got == c["expected"]


@pytest.mark.parametrize("case", BOARD["latestOpened"], ids=lambda c: c["name"])
def test_latest_opened(case: dict[str, Any]) -> None:
    i = case["input"]
    db, viewer = i["db"], _viewer(i)
    got = {}
    for r in db["risks"]:
        lo = b.latest_opened(db, viewer, r, i["at"])
        got[r["id"]] = lo and {
            "quarter_id": lo["quarter"]["id"],
            "hidden": lo["hidden"],
            "chips": lo["chips"],
            "tidak_sesuai": lo["tidak_sesuai"],
            "recurring": lo["recurring"],
        }
    assert got == case["expected"]


def test_thread_participants() -> None:
    c = _map_case("threadParticipants")
    i = c["input"]
    got = {
        qid: [
            [p["user_id"], p["holding"]["position_id"], p["holding"]["line"]]
            for p in b.thread_participants(i["db"], i["position_id"], qid, i["today"])
        ]
        for qid in c["expected"]
    }
    assert got == c["expected"]


def test_storage_used() -> None:
    c = _map_case("storageUsed")
    db = c["input"]["db"]
    got = {p["id"]: b.storage_used(db, p["id"], c["input"]["fiscal_year"]) for p in db["positions"]}
    assert got == c["expected"]


@pytest.mark.parametrize("case", BOARD["fileProblem"], ids=lambda c: c["name"])
def test_file_problem(case: dict[str, Any]) -> None:
    assert b.file_problem(case["input"]["name"], case["input"]["size"]) == case["expected"]


@pytest.mark.parametrize("case", BOARD["canEditComment"], ids=lambda c: c["name"])
def test_can_edit_comment(case: dict[str, Any]) -> None:
    i = case["input"]
    comment = next(c for c in i["db"]["comments"] if c["id"] == i["comment_id"])
    assert b.can_edit_comment(comment, i["user_id"], i["at"]) is case["expected"]
