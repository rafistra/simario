from typing import Any

from rest_framework.test import APIClient

from simario.audit.models import AuditLog
from simario.core import clock
from simario.notifications.models import Notification
from tests.demo import uid

DEV = "/api/v1/dev"
ANDI_NIP = "198204172008011003"
UNREGISTERED_NIP = "199812012024011001"


def test_impersonate_known_nip(demo: None) -> None:
    client = APIClient()
    res = client.post(f"{DEV}/impersonate", {"nip": ANDI_NIP}, format="json")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "userId": uid("usr-andi")}
    assert client.get("/api/v1/me").json()["user"]["nip"] == ANDI_NIP


def test_impersonate_unknown_nip_audits(demo: None) -> None:
    res = APIClient().post(f"{DEV}/impersonate", {"nip": UNREGISTERED_NIP}, format="json")
    assert res.status_code == 401
    assert res.json()["code"] == "login_failed"
    assert res.json()["message"].startswith("Akun Anda belum terdaftar di SIMARIO.")
    assert AuditLog.objects.filter(
        action="masuk_ditolak_belum_terdaftar", entity_id=UNREGISTERED_NIP
    ).exists()


def test_impersonate_inactive_message(demo: None) -> None:
    from simario.accounts.models import User

    User.objects.filter(nip=ANDI_NIP).update(is_active=False)
    res = APIClient().post(f"{DEV}/impersonate", {"nip": ANDI_NIP}, format="json")
    assert res.json()["message"] == "Akun Anda tidak aktif. Hubungi Superadmin."


def test_clock_sets_now_and_runs_tasks(demo: None) -> None:
    res = APIClient().post(f"{DEV}/clock", {"at": "2027-03-18T09:00"}, format="json")
    assert res.status_code == 200
    assert res.json()["serverNow"].startswith("2027-03-18T09:0")
    assert isinstance(res.json()["ran"], list)
    assert clock.today().isoformat() == "2027-03-18"


def test_reset_reloads_and_signs_out(demo: None) -> None:
    client = APIClient()
    client.post(f"{DEV}/impersonate", {"nip": ANDI_NIP}, format="json")
    Notification.objects.all().delete()
    res = client.post(f"{DEV}/reset", {"asOf": "2027-03-18T09:00"}, format="json")
    assert res.status_code == 200
    assert res.json()["counts"]["users"] == 21
    assert Notification.objects.exists()
    assert clock.today().isoformat() == "2027-03-18"
    assert client.get("/api/v1/me").status_code == 401


def test_personas_lists_users_and_unregistered(demo: None) -> None:
    body = APIClient().get(f"{DEV}/personas").json()
    andi = next(p for p in body["personas"] if p["nip"] == ANDI_NIP)
    assert andi["fullName"] == "Andi Wirawan"
    assert andi["holdings"] == [{"positionName": "PPK A-1", "line": 1, "capacity": "pejabat"}]
    assert "PMR" in andi["roleViews"]
    assert body["unregistered"]["nip"] == UNREGISTERED_NIP


def test_dev_endpoints_404_without_dev_tools(demo: None, settings: Any) -> None:
    settings.SIMARIO_DEV_TOOLS = False
    client = APIClient()
    assert client.get(f"{DEV}/personas").status_code == 404
    assert client.post(f"{DEV}/impersonate", {"nip": ANDI_NIP}, format="json").status_code == 404
    assert client.post(f"{DEV}/clock", {"at": "2027-03-18T09:00"}, format="json").status_code == 404
    assert client.post(f"{DEV}/reset", {}, format="json").status_code == 404
