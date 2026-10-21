from typing import Any

from simario.core import clock
from tests.demo import client_for, uid

A1 = uid("pos-ppk-a1")
URL = f"/api/v1/positions/{A1}/history/2027"


def _history(persona: str, url: str = URL) -> dict[str, Any]:
    res = client_for(persona).get(url)
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def test_history_matrix_and_cross_year(demo: None) -> None:
    body = _history("usr-andi")
    assert body["published"] and body["years"] == [2027, 2026]
    assert len(body["quarters"]) == 4 and len(body["mutu"]) == 4
    row = body["rows"][0]
    assert len(row["cells"]) == 4
    assert row["cells"][0]["state"] == "open" and row["cells"][1]["state"] == "waiting"
    assert any(r["otherYears"] for r in body["rows"])
    assert "score" not in body["rows"][0]["cells"][0]["chips"][0]["assessment"]
    assert body["mutu"][0]["anyOpened"] is True


def test_history_late_directorate(demo: None) -> None:
    """VIS-9: before PAI's TW I results opened, Maya sees TW I as waiting."""
    clock.set_now(clock.parse_local("2027-03-20T09:00"))
    body = _history("usr-maya")
    assert all(r["cells"][0]["state"] in ("waiting", "none") for r in body["rows"])
    assert body["mutu"][0]["anyOpened"] is False


def test_history_scope(demo: None) -> None:
    assert client_for("usr-bambang").get(URL).status_code == 403
