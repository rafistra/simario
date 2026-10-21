from typing import Any

import pytest
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.test import RequestFactory

from simario.accounts.models import User
from simario.accounts.oidc import SimarioOIDCBackend
from simario.audit.models import AuditLog
from simario.org.models import PositionDelegate, PositionOccupancy, Role, UserRole
from tests.demo import client_for, uid, user

NEW_USER = {
    "nip": "199905052024011001",
    "fullName": "Galih Baru",
    "email": "galih.baru@ikn.go.id",
    "isLocalAccount": True,
}


def test_add_local_user_returns_temporary_password_once(demo: None) -> None:
    admin = client_for("usr-admin")
    res = admin.post("/api/v1/users", {**NEW_USER, "orgUnitId": uid("ou-ddkb")}, format="json")
    assert res.status_code == 201
    body = res.json()
    temp = body["temporaryPassword"]
    created = User.objects.get(pk=body["id"])
    assert created.check_password(temp) and created.must_change_password
    entry = AuditLog.objects.get(action="tambah_pengguna")
    assert temp not in str(entry.after)
    dup = admin.post("/api/v1/users", {**NEW_USER, "orgUnitId": uid("ou-ddkb")}, format="json")
    assert dup.status_code == 422
    assert dup.json()["message"] == "NIP ini sudah terdaftar."
    short = admin.post(
        "/api/v1/users", {**NEW_USER, "nip": "123", "orgUnitId": uid("ou-ddkb")}, format="json"
    )
    assert short.json()["message"] == "NIP harus 18 digit."
    sso = admin.post(
        "/api/v1/users",
        {
            **NEW_USER,
            "nip": "199905052024011002",
            "isLocalAccount": False,
            "orgUnitId": uid("ou-ddkb"),
        },
        format="json",
    )
    assert sso.json()["temporaryPassword"] is None


def test_lini1_cannot_add_users(demo: None) -> None:
    res = client_for("usr-andi").post(
        "/api/v1/users", {**NEW_USER, "orgUnitId": uid("ou-ddkb")}, format="json"
    )
    assert res.status_code == 403


def test_pokja_filler_cannot_be_deactivated(demo: None) -> None:
    res = client_for("usr-admin").post(f"/api/v1/users/{uid('usr-dimas')}/deactivate")
    assert res.status_code == 409
    assert res.json()["code"] == "filler"
    assert res.json()["message"].startswith("Pengguna ini Pengisi ")
    assert res.json()["message"].endswith(
        "Pindahkan tanda Pengisi ke anggota lain terlebih dahulu."
    )


def test_deactivated_user_session_ends(demo: None) -> None:
    andi = client_for("usr-andi")
    assert andi.get("/api/v1/me").status_code == 200
    res = client_for("usr-admin").post(f"/api/v1/users/{uid('usr-andi')}/deactivate")
    assert res.status_code == 200
    assert res.json()["occupancies"] >= 1
    assert andi.get("/api/v1/me").status_code == 401
    andi_user = user("usr-andi")
    assert not andi_user.is_active
    today = "2027-04-06"
    assert not PositionOccupancy.objects.filter(user=andi_user, end_date__isnull=True).exists()
    rafi_ops = PositionDelegate.objects.filter(user=user("usr-rafi")).exclude(end_date__lt=today)
    assert not rafi_ops.exists()
    assert AuditLog.objects.filter(action="nonaktifkan_pengguna").exists()
    back = client_for("usr-admin").post(f"/api/v1/users/{uid('usr-andi')}/reactivate")
    assert back.status_code == 204
    assert User.objects.get(pk=andi_user.pk).is_active


def test_manual_roles_bump_epoch(demo: None) -> None:
    target = user("usr-andi")
    epoch = target.auth_epoch
    role = Role.objects.filter(is_locked=False).first()
    assert role is not None
    res = client_for("usr-admin").put(
        f"/api/v1/users/{target.id}/roles", {"roleIds": [str(role.id)]}, format="json"
    )
    assert res.status_code == 204
    target.refresh_from_db()
    assert target.auth_epoch == epoch + 1
    assert UserRole.objects.filter(user=target, source="manual").count() == 1
    assert AuditLog.objects.filter(action="ubah_peran_pengguna").exists()


def test_last_role_manager_cannot_lose_roles(demo: None) -> None:
    admin = user("usr-admin")
    res = client_for("usr-admin").put(
        f"/api/v1/users/{admin.id}/roles", {"roleIds": []}, format="json"
    )
    assert res.status_code == 409
    assert res.json()["code"] == "inv5"


def test_reset_password_audit_has_no_values(demo: None) -> None:
    admin = client_for("usr-admin")
    created = admin.post(
        "/api/v1/users", {**NEW_USER, "orgUnitId": uid("ou-ddkb")}, format="json"
    ).json()
    res = admin.post(f"/api/v1/users/{created['id']}/reset-password")
    assert res.status_code == 200
    temp = res.json()["temporaryPassword"]
    assert User.objects.get(pk=created["id"]).check_password(temp)
    entry = AuditLog.objects.get(action="atur_ulang_kata_sandi")
    assert entry.before is None and entry.after is None
    sso = admin.post(f"/api/v1/users/{uid('usr-andi')}/reset-password")
    assert sso.status_code == 422
    assert sso.json()["message"] == "Akun SSO mengatur kata sandinya di Keycloak."


def _request() -> HttpRequest:
    request = RequestFactory().get("/")
    SessionMiddleware(lambda r: HttpResponse()).process_request(request)
    return request


def test_inactive_sso_user_is_not_restored(demo: None) -> None:
    andi = user("usr-andi")
    backend: Any = SimarioOIDCBackend()
    assert backend.get_user(andi.pk) == andi
    andi.is_active = False
    andi.save()
    assert backend.get_user(andi.pk) is None


@pytest.fixture(autouse=True)
def _no_keycloak(settings: Any) -> None:
    settings.OIDC_ISSUER = ""
