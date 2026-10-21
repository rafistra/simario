from tests.demo import client_for, uid


def test_queue_for_lini3(demo: None) -> None:
    res = client_for("usr-hendra").get("/api/v1/assessment-queue")
    assert res.status_code == 200
    body = res.json()
    assert body["directorate"]["id"] == uid("pos-kepatuhan")
    rows = {r["positionId"]: r for r in body["rows"]}
    assert rows[uid("pos-ppk-a1")]["total"] > 0
    assert any(r["status"] == "belum_terbit" for r in body["rows"])
    assert {q["id"] for q in body["quarters"]} >= {uid("q-2027-1"), uid("q-2027-2")}


def test_queue_for_chosen_quarter(demo: None) -> None:
    q = uid("q-2027-1")
    body = client_for("usr-maya").get(f"/api/v1/assessment-queue?quarterId={q}").json()
    assert body["quarter"]["id"] == q
    a1 = next(r for r in body["rows"] if r["positionId"] == uid("pos-ppk-a1"))
    assert a1["lini1Done"] is True
