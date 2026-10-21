from typing import Any

import pytest

from simario.domain import sheet_payload as sp
from tests.vectors import load_vectors

V = load_vectors("sheet-payload")


def _q(db: Any, qid: str) -> Any:
    return next(q for q in db["quarters"] if q["id"] == qid)


def _lower_photos(payload: dict[str, Any]) -> dict[str, Any]:
    """The loader snake-cases the section keys A/B/C to a/b/c."""
    return {**payload, "photos": {k.lower(): v for k, v in payload["photos"].items()}}


@pytest.mark.parametrize("case", V["buildSheetPayload"], ids=lambda c: c["name"])
def test_build_sheet_payload(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    selection = i.get("selection")
    if selection is not None:
        selection = {k.upper(): v for k, v in selection.items()}
    got = {}
    for key in case["expected"]:
        p, qid = key.split("|")
        payload = _lower_photos(sp.build_sheet_payload(db, p, _q(db, qid), i["at"], selection))
        got[key] = payload["photos"] if selection is not None else payload
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["maskPayloadFor"], ids=lambda c: c["name"])
def test_mask_payload_for(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {}
    for key in case["expected"]:
        p, qid, l3 = key.split("|")
        payload = sp.build_sheet_payload(db, p, _q(db, qid), i["at"])
        masked, ids = sp.mask_payload_for(payload, l3.split("+"))
        got[key] = {"masked": ids, "mutu": sp.mutu_from_payload(masked)}
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["mutuFromPayload"], ids=lambda c: c["name"])
def test_mutu_from_payload(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {}
    for key in case["expected"]:
        p, qid = key.split("|")
        got[key] = sp.mutu_from_payload(sp.build_sheet_payload(db, p, _q(db, qid), i["at"]))
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["freezeReady"], ids=lambda c: c["name"])
def test_freeze_ready(case: dict[str, Any]) -> None:
    i = case["input"]
    db = i["db"]
    got = {}
    for key in case["expected"]:
        p, qid = key.split("|")
        got[key] = sp.freeze_ready(db, p, _q(db, qid), i["at"])
    assert got == case["expected"]


@pytest.mark.parametrize("case", V["snapshotNumber"], ids=lambda c: c["name"])
def test_snapshot_number(case: dict[str, Any]) -> None:
    db = case["input"]["db"]
    got = {}
    for key in case["expected"]:
        p, qid, kind = key.split("|")
        got[key] = sp.snapshot_number(db, kind, p, _q(db, qid))
    assert got == case["expected"]
