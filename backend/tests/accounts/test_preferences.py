from tests.demo import client_for


def test_preferences_are_per_user(demo: None) -> None:
    andi, rafi = client_for("usr-andi"), client_for("usr-rafi")
    res = andi.put(
        "/api/v1/preferences/papan-filter:pos-x",
        {"value": {"riskTypes": ["kecurangan"], "quiet": True}},
        format="json",
    )
    assert res.status_code == 204
    mine = andi.get("/api/v1/preferences").json()["items"]
    assert mine == [
        {"key": "papan-filter:pos-x", "value": {"riskTypes": ["kecurangan"], "quiet": True}}
    ]
    assert rafi.get("/api/v1/preferences").json()["items"] == []
    andi.put("/api/v1/preferences/sidebar", {"value": True}, format="json")
    assert len(andi.get("/api/v1/preferences").json()["items"]) == 2
