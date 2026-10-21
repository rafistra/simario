from typing import Any

import pytest

from simario.domain import sheets as s
from simario.domain import visibility as v
from tests.vectors import load_vectors

V = load_vectors("sheets")


@pytest.mark.parametrize("case", V["lembarMutu"], ids=lambda c: c["name"])
def test_lembar_mutu(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    viewer = v.viewer_for(db, i["user_id"], i["at"][:10])
    got = {}
    for key in case["expected"]:
        p, qid = key.split("|")
        q = next(x for x in db["quarters"] if x["id"] == qid)
        m = s.lembar_mutu(db, viewer, p, q, i["at"])
        got[key] = {
            "quarter_id": m["quarter"]["id"],
            "assessors": m["assessors"],
            "rows": m["rows"],
            "sesuai": m["sesuai"],
            "tidak_sesuai": m["tidak_sesuai"],
            "berulang": m["berulang"],
            "not_assessed_l1": [r["id"] for r in m["not_assessed_l1"]],
            "any_opened": m["any_opened"],
        }
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["latestOpenedQuarter"], ids=lambda c: c["name"])
def test_latest_opened_quarter(case: dict[str, Any]) -> None:
    i = case["input"]
    got = {}
    for p in case["expected"]:
        q = s.latest_opened_quarter(i["db"], p, i["at"])
        got[p] = q["id"] if q else None
    assert got == case["expected"]
