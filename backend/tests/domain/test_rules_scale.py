"""The rules run inside every read model over all rows; they must stay linear at OIKN scale
(about 300 Lini 1 positions × 30 risks, final review B6)."""

import time
from typing import Any

from simario.domain import assessment as rules
from simario.domain import board as board_rules


def _db(positions: int = 300, risks: int = 30) -> dict[str, Any]:
    quarters = [
        {
            "id": f"q{n}",
            "fiscal_year": 2027,
            "number": n,
            "starts_on": f"2027-0{n * 3 - 2}-01",
            "ends_on": f"2027-0{n * 3}-28",
        }
        for n in (1, 2, 3)
    ]
    db: dict[str, Any] = {
        "quarters": quarters,
        "registers": [],
        "risks": [],
        "risk_quarters": [],
        "results": [],
        "comments": [],
        "assessments": [],
    }
    for p in range(positions):
        db["registers"].append({"id": f"reg{p}", "position_id": f"pos{p}", "fiscal_year": 2027})
        for r in range(risks):
            rid = f"r{p}-{r}"
            db["risks"].append(
                {
                    "id": rid,
                    "register_id": f"reg{p}",
                    "published_at": "2027-01-05T09:00",
                    "status": "active",
                }
            )
            for q in quarters:
                db["risk_quarters"].append(
                    {"id": f"rq{rid}-{q['id']}", "register_risk_id": rid, "quarter_id": q["id"]}
                )
                db["results"].append(
                    {
                        "risk_quarter_id": f"rq{rid}-{q['id']}",
                        "opened_at": "2027-04-03T00:00",
                        "lini3_position_id": "kep",
                    }
                )
    return db


def test_quarter_risks_and_openings_stay_linear() -> None:
    db = _db()
    start = time.perf_counter()
    total = 0
    for q in db["quarters"]:
        for reg in db["registers"]:
            for _, rq in rules.quarter_risks(db, reg["position_id"], q):
                total += len(board_rules.opened_results(db, rq["id"], "2027-04-06T09:00"))
    assert total == 300 * 30 * 3
    assert time.perf_counter() - start < 3
