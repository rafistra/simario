from typing import Any

from tests.demo import client_for, uid


def _home(persona: str, position: str | None = None) -> dict[str, Any]:
    url = "/api/v1/home" + (f"?position={uid(position)}" if position else "")
    res = client_for(persona).get(url)
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def test_home_cards_per_persona(demo: None) -> None:
    andi = _home("usr-andi")
    assert andi["line"] == 1 and andi["isPejabat"] is True
    l1 = andi["lini1"]
    assert {"obligations", "upcoming", "actions", "register", "lastQuarter"} <= set(l1)
    assert any("menunggu penjelasan" in a["text"] for a in l1["actions"])
    assert l1["lastQuarter"]["mutu"]["anyOpened"] is True
    assert isinstance(andi["activity"], list)

    rafi = _home("usr-rafi")
    assert rafi["line"] == 1 and rafi["isPejabat"] is False
    assert not any("siap dari operator" in a["text"] for a in rafi["lini1"]["actions"])

    siti = _home("usr-siti")
    assert siti["line"] == 2 and siti["lini2"]["rows"]

    hendra = _home("usr-hendra")
    assert hendra["line"] == 3 and hendra["lini3"]["directorate"]
    assert hendra["lini3"]["obligations"] and hendra["lini3"]["attention"] is not None

    admin = _home("usr-admin")
    assert admin["line"] is None and len(admin["health"]) == 4
    assert admin["activity"] is None and "pmd" not in admin

    nur = _home("usr-nur")
    assert nur["line"] is None and "pmd" in nur and "health" not in nur


def test_position_list_scope(demo: None) -> None:
    siti = client_for("usr-siti").get("/api/v1/my-positions").json()
    admin = client_for("usr-admin").get("/api/v1/my-positions").json()
    assert siti and admin
    assert {r["positionId"] for r in siti} <= {r["positionId"] for r in admin}
    assert len(siti) < len(admin)
    andi = client_for("usr-andi").get("/api/v1/my-positions").json()
    assert [r["positionId"] for r in andi] == [uid("pos-ppk-a1")]
