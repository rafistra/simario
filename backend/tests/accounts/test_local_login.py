import datetime as dt

from django.conf import settings
from rest_framework.test import APIClient

from simario.accounts.models import User
from simario.core import clock

from .conftest import LOCAL_NIP, LOCAL_PASSWORD

LOGIN = "/api/v1/auth/login"


def _login(client: APIClient, nip: str, password: str):  # type: ignore[no-untyped-def]
    return client.post(LOGIN, {"nip": nip, "password": password}, format="json")


def test_local_login_succeeds_for_local_account(client: APIClient, local_user: User) -> None:
    res = _login(client, LOCAL_NIP, LOCAL_PASSWORD)
    assert res.status_code == 200
    assert res.json() == {"ok": True, "userId": str(local_user.id)}


def test_wrong_password_message(client: APIClient, local_user: User) -> None:
    res = _login(client, LOCAL_NIP, "salah")
    assert res.status_code == 401
    assert res.json()["code"] == "login_failed"
    assert res.json()["message"] == "NIP atau kata sandi tidak sesuai"


def test_fifth_failure_locks_for_15_minutes(client: APIClient, local_user: User) -> None:
    for _ in range(4):
        assert _login(client, LOCAL_NIP, "salah").json()["code"] == "login_failed"
    fifth = _login(client, LOCAL_NIP, "salah")
    assert fifth.status_code == 423
    assert fifth.json()["message"] == (
        "Akun dikunci sementara setelah 5 kali gagal masuk. Coba lagi dalam 15 menit."
    )
    locked = _login(client, LOCAL_NIP, LOCAL_PASSWORD)
    assert locked.json()["code"] == "locked_out"
    assert locked.json()["message"].startswith("Akun dikunci sementara")


def test_lock_expires_with_simulated_clock(client: APIClient, local_user: User) -> None:
    for _ in range(5):
        _login(client, LOCAL_NIP, "salah")
    clock.set_now(clock.now() + dt.timedelta(minutes=16))
    assert _login(client, LOCAL_NIP, LOCAL_PASSWORD).status_code == 200


def test_inactive_local_account_rejected(client: APIClient, local_user: User) -> None:
    local_user.is_active = False
    local_user.save()
    res = _login(client, LOCAL_NIP, LOCAL_PASSWORD)
    assert res.json()["message"] == "Akun Anda tidak aktif. Hubungi Superadmin."


def test_sso_only_user_cannot_use_local_login(client: APIClient, sso_user: User) -> None:
    res = _login(client, sso_user.nip, "apa-saja")
    assert res.json()["code"] == "login_failed"
    assert res.json()["message"] == "NIP atau kata sandi tidak sesuai"


def test_login_requires_csrf(local_user: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    res = _login(client, LOCAL_NIP, LOCAL_PASSWORD)
    assert res.status_code == 403
    assert res.json()["code"] == "forbidden"


def test_config_sets_csrf_cookie(client: APIClient, db: None) -> None:
    res = client.get("/api/v1/auth/config")
    assert res.status_code == 200
    assert res.json() == {"devTools": True, "oidcEnabled": bool(settings.OIDC_ISSUER)}
    assert "csrftoken" in res.cookies


def test_failure_count_locks_its_row(client: APIClient, local_user: User) -> None:
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as ctx:
        _login(client, LOCAL_NIP, "salah")
    # The read the new count is computed from must hold the row lock (no lost increments).
    first = next(q["sql"] for q in ctx.captured_queries if "accounts_loginlockout" in q["sql"])
    assert "FOR UPDATE" in first
