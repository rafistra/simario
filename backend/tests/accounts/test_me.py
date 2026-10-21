import datetime as dt
from typing import Any

from rest_framework.test import APIClient

from simario.accounts.selectors import build_me
from simario.core import clock
from simario.devtools.seed import legacy_uuid
from simario.domain.access import holdings_of
from simario.org.models import PositionDelegate, PositionOccupancy
from tests.demo import client_for, uid, user
from tests.vectors import _demo

ME = "/api/v1/me"


def _me(prototype_id: str) -> dict[str, Any]:
    res = client_for(prototype_id).get(ME)
    assert res.status_code == 200, res.content
    body: dict[str, Any] = res.json()
    return body


def test_me_for_andi(demo: None) -> None:
    me = _me("usr-andi")
    assert me["user"]["nip"] == "198204172008011003"
    assert me["today"] == "2027-04-06"
    assert me["serverNow"].startswith("2027-04-06T09:0")
    assert me["serverNow"].endswith("+08:00")
    [holding] = me["holdings"]
    assert holding["positionId"] == uid("pos-ppk-a1")
    assert holding["capacity"] == "pejabat"
    assert holding["officialName"] == "Andi Wirawan"
    assert holding["position"]["code"] == "PPKA1"
    assert holding["roleView"] == "PMR"
    assert {"code": 1, "scope": "sendiri"} in me["permissions"]
    assert me["currentQuarter"]["number"] == 2
    assert me["activePositionId"] == uid("pos-ppk-a1")
    assert me["devTools"] is True


def test_me_for_rafi_operator(demo: None) -> None:
    [holding] = _me("usr-rafi")["holdings"]
    assert holding["capacity"] == "operator"
    assert holding["officialName"] == "Andi Wirawan"


def test_me_without_holdings(demo: None) -> None:
    me = _me("usr-nur")
    assert me["holdings"] == []
    assert me["activePositionId"] is None
    assert "PMD" in me["roleViews"]


def test_me_skips_orphan_delegation(demo: None) -> None:
    rafi = PositionDelegate.objects.get(pk=legacy_uuid("del-rafi-a1"))
    PositionOccupancy.objects.filter(pk=rafi.appointed_by_id).update(end_date=dt.date(2027, 3, 1))
    assert _me("usr-rafi")["holdings"] == []


def test_me_requires_session(demo: None) -> None:
    res = APIClient().get(ME)
    assert res.status_code == 401
    assert res.json()["code"] == "unauthenticated"


def test_active_position_persists(demo: None) -> None:
    client = client_for("usr-dimas")
    target = uid("pos-ppk-a2")
    res = client.put("/api/v1/me/active-position", {"positionId": target}, format="json")
    assert res.status_code == 204
    assert client.get(ME).json()["activePositionId"] == target


def test_active_position_rejects_unheld(demo: None) -> None:
    client = client_for("usr-andi")
    res = client.put("/api/v1/me/active-position", {"positionId": uid("pos-ppk-a2")}, format="json")
    assert res.status_code == 403
    assert res.json()["code"] == "forbidden"


def test_me_holdings_match_access_vectors(demo: None) -> None:
    today = clock.today().isoformat()
    expected = holdings_of(_demo()["db"], "usr-dimas", today)
    got = build_me(user("usr-dimas"))["holdings"]
    assert [h["position_id"] for h in got] == [str(legacy_uuid(h["position_id"])) for h in expected]
    assert [h["capacity"] for h in got] == [h["capacity"] for h in expected]
