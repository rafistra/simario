from simario.devtools.seed import legacy_uuid
from tests.demo import client_for


def test_master_usage_counts_registers_and_past_use(demo: None) -> None:
    """The master pages' hints (B9: they no longer have the register rows to count)."""
    res = client_for("usr-nur").get("/api/v1/master-usage?fiscalYear=2027")
    assert res.status_code == 200, res.json()
    body = res.json()
    used = body["templates"]
    tpl = str(legacy_uuid("tpl-PPK-T3-KP-02"))
    assert used.get(tpl, 0) >= 1
    assert tpl in body["everUsed"]
    assert str(legacy_uuid("stg-PPK-T2")) in body["stagesUsed"]
    assert client_for("usr-rafi").get("/api/v1/master-usage?fiscalYear=2027").status_code == 403
