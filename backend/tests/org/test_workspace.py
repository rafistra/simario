from tests.demo import client_for, uid


def test_workspace_header(demo: None) -> None:
    res = client_for("usr-andi").get(f"/api/v1/positions/{uid('pos-ppk-a1')}/workspace?ta=2027")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["position"]["name"] == "PPK A-1" and body["unit"]["code"]
    assert {y["year"] for y in body["years"]} >= {2026, 2027}
    assert body["officials"][0]["name"] == "Andi Wirawan"
    assert "Rafi Ananda" in body["operators"]


def test_workspace_scope(demo: None) -> None:
    url = f"/api/v1/positions/{uid('pos-ppk-a1')}/workspace"
    assert client_for("usr-bambang").get(url).status_code == 403
    lini3 = f"/api/v1/positions/{uid('pos-kepatuhan')}/workspace"
    assert client_for("usr-admin").get(lini3).status_code == 404
    unknown = "/api/v1/positions/00000000-0000-0000-0000-000000000000/workspace"
    assert client_for("usr-admin").get(unknown).status_code == 404
