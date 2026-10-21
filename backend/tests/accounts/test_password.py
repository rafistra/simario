from rest_framework.test import APIClient

from simario.accounts.models import User
from simario.accounts.services import bump_auth_epoch
from simario.audit.models import AuditLog

from .conftest import LOCAL_PASSWORD

PASSWORD = "/api/v1/auth/password"


def _change(client: APIClient, body: dict[str, str]):  # type: ignore[no-untyped-def]
    return client.post(PASSWORD, body, format="json")


def test_change_password_rules(client: APIClient, local_user: User, sso_user: User) -> None:
    client.force_login(local_user)
    assert _change(client, {"oldPassword": "salah", "newPassword": "x" * 12}).json()["code"] == (
        "old_password"
    )
    short = _change(client, {"oldPassword": LOCAL_PASSWORD, "newPassword": "pendek"})
    assert short.json() == {"code": "too_short", "message": "Minimal 12 karakter.", "details": None}
    same = _change(client, {"oldPassword": LOCAL_PASSWORD, "newPassword": LOCAL_PASSWORD})
    assert same.json()["message"] == "Kata sandi baru harus berbeda dari kata sandi awal."
    client.force_login(sso_user)
    assert _change(client, {"newPassword": "x" * 12}).json()["message"] == (
        "Hanya akun lokal yang memakai kata sandi SIMARIO."
    )


def test_forced_change_needs_no_old_password(client: APIClient, local_user: User) -> None:
    local_user.must_change_password = True
    local_user.save()
    client.force_login(local_user)
    assert _change(client, {"newPassword": "Sandi-Baru-2027!"}).status_code == 204
    local_user.refresh_from_db()
    assert not local_user.must_change_password
    assert local_user.check_password("Sandi-Baru-2027!")


def test_change_password_audits_without_values(client: APIClient, local_user: User) -> None:
    client.force_login(local_user)
    _change(client, {"oldPassword": LOCAL_PASSWORD, "newPassword": "Sandi-Baru-2027!"})
    entry = AuditLog.objects.get(action="ganti_kata_sandi")
    assert entry.before is None and entry.after is None
    assert entry.actor_id == local_user.id


def test_change_password_keeps_current_session(client: APIClient, local_user: User) -> None:
    client.force_login(local_user)
    _change(client, {"oldPassword": LOCAL_PASSWORD, "newPassword": "Sandi-Baru-2027!"})
    again = _change(client, {"oldPassword": "Sandi-Baru-2027!", "newPassword": "Sandi-Lagi-2027!"})
    assert again.status_code == 204


def test_auth_epoch_bump_ends_session(client: APIClient, local_user: User) -> None:
    client.post(
        "/api/v1/auth/login", {"nip": local_user.nip, "password": LOCAL_PASSWORD}, format="json"
    )
    bump_auth_epoch(local_user)
    res = _change(client, {"oldPassword": LOCAL_PASSWORD, "newPassword": "Sandi-Baru-2027!"})
    assert res.status_code == 401
    assert res.json()["code"] == "unauthenticated"
