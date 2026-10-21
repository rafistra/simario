import pytest
from rest_framework.test import APIClient

from simario.core.health import CHECKS

pytestmark = pytest.mark.django_db


def test_health_ok(client: APIClient, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("redis", "storage", "clamav"):
        monkeypatch.setitem(CHECKS, name, lambda: True)
    res = client.get("/api/v1/health/")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ok",
        "checks": {"database": "ok", "redis": "ok", "storage": "ok", "clamav": "ok"},
    }


def test_health_degraded_when_check_fails(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    for name in ("redis", "storage"):
        monkeypatch.setitem(CHECKS, name, lambda: True)
    monkeypatch.setitem(CHECKS, "clamav", lambda: False)
    res = client.get("/api/v1/health/")
    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
    assert res.json()["checks"]["clamav"] == "error"
