import datetime as dt
from typing import Any

import pytest
from rest_framework.test import APIClient

from simario.accounts import keycloak
from simario.accounts.models import User
from simario.audit.models import AuditLog
from simario.core import clock, scheduler
from simario.notifications.models import Notification
from simario.org.models import PositionDelegate, PositionOccupancy
from tests.demo import client_for, uid, user

GALIH_NIP = "199812012024011001"


def _assign(client: APIClient, user_id: str, position: str = "pos-ppk-b2") -> Any:
    return client.post(
        "/api/v1/occupancies",
        {
            "userId": user_id,
            "positionId": uid(position),
            "decreeNo": "KEP-90/2027",
            "decreeDate": "2027-04-01",
            "decreeFile": None,
            "startDate": "2027-04-01",
            "isFiller": False,
        },
        format="json",
    )


def test_assign_to_occupied_single_position_refused(demo: None) -> None:
    res = _assign(client_for("usr-admin"), uid("usr-fajar"), "pos-ppk-a1")
    assert res.status_code == 409
    assert res.json() == {
        "code": "occupied",
        "message": "Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat.",
        "details": None,
    }


def test_concurrent_assign_to_single_official_position(demo: None) -> None:
    admin = client_for("usr-admin")
    first = _assign(admin, uid("usr-fajar"))
    assert first.status_code == 200
    assert PositionOccupancy.objects.filter(pk=first.json()["occupancyId"]).exists()
    second = _assign(admin, uid("usr-dewi"))
    assert second.status_code == 409 and second.json()["code"] == "occupied"
    assert AuditLog.objects.filter(action="tetapkan_jabatan").count() == 1


def _replace(incoming: str) -> Any:
    return client_for("usr-admin").post(
        f"/api/v1/positions/{uid('pos-ppk-a1')}/replace-official",
        {
            "outgoingOccupancyId": uid("occ-andi-a1"),
            "incomingUserId": uid(incoming),
            "effectiveDate": "2027-04-06",
            "decreeNo": "KEP-91/2027",
            "decreeDate": "2027-04-05",
            "decreeFile": None,
        },
        format="json",
    )


def test_replace_official_ends_operators(demo: None) -> None:
    res = _replace("usr-fajar")
    assert res.status_code == 200
    assert res.json() == {"operatorsEnded": 1, "promoted": 0}
    rafi = PositionDelegate.objects.get(pk=uid("del-rafi-a1"))
    assert rafi.end_reason == "official_changed"
    assert rafi.end_date == dt.date(2027, 4, 5)
    andi = PositionOccupancy.objects.get(pk=uid("occ-andi-a1"))
    assert andi.end_date == dt.date(2027, 4, 5)
    assert Notification.objects.filter(
        user=user("usr-rafi"), kind="operator_revoked", event_key=f"op-end:{rafi.id}"
    ).exists()
    assert AuditLog.objects.filter(action="alih_pejabat").exists()


def test_replace_official_ends_sessions_of_affected_users(demo: None) -> None:
    epochs = {p: user(p).auth_epoch for p in ("usr-andi", "usr-fajar", "usr-rafi")}
    rafi = client_for("usr-rafi")
    assert rafi.get("/api/v1/me").status_code == 200
    assert _replace("usr-fajar").status_code == 200
    for persona, epoch in epochs.items():
        assert user(persona).auth_epoch > epoch, persona
    assert rafi.get("/api/v1/me").status_code == 401


def test_move_filler_ends_operators_of_previous_filler(demo: None) -> None:
    res = client_for("usr-admin").post(
        f"/api/v1/positions/{uid('pos-pokja-03')}/filler",
        {"toOccupancyId": uid("occ-ratna-pokja")},
        format="json",
    )
    assert res.status_code == 200
    assert res.json() == {"operatorsEnded": 1}
    assert PositionOccupancy.objects.get(pk=uid("occ-ratna-pokja")).is_filler
    assert not PositionOccupancy.objects.get(pk=uid("occ-dimas-pokja")).is_filler
    assert PositionDelegate.objects.get(pk=uid("del-rina-pokja")).end_reason == "filler_changed"


def _appoint(client: APIClient, nip: str) -> Any:
    return client.post(
        f"/api/v1/positions/{uid('pos-ppk-a1')}/delegates",
        {
            "nip": nip,
            "letterNo": "ND-12/PPK-A1/2027",
            "letterDate": "2027-04-06",
            "letterFile": "ND_12.pdf",
            "endDate": None,
        },
        format="json",
    )


def test_andi_appoints_galih_who_can_sign_in(demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        keycloak,
        "find_staff",
        lambda nip: {
            "nip": nip,
            "full_name": "Galih Pratama",
            "email": "galih.pratama@ikn.go.id",
            "org_unit_id": "",
        },
    )
    res = _appoint(client_for("usr-andi"), GALIH_NIP)
    assert res.status_code == 201
    galih = User.objects.get(nip=GALIH_NIP)
    assert galih.created_via == "delegation" and galih.full_name == "Galih Pratama"
    assert str(galih.org_unit_id) == uid("ou-ddkb")
    assert Notification.objects.filter(user=galih, kind="operator_appointed").exists()
    assert AuditLog.objects.filter(action="tunjuk_operator", acting_as="pejabat").exists()
    client = APIClient()
    login = client.post("/api/v1/dev/impersonate", {"nip": GALIH_NIP}, format="json")
    assert login.status_code == 200
    holdings = client.get("/api/v1/me").json()["holdings"]
    assert [(h["positionId"], h["capacity"]) for h in holdings] == [(uid("pos-ppk-a1"), "operator")]
    mine = client.get("/api/v1/me/positions").json()
    assert mine["operatorOf"][0]["appointedBy"] == "Andi Wirawan"


def test_operator_cannot_appoint_or_revoke(demo: None) -> None:
    rafi = client_for("usr-rafi")
    res = _appoint(rafi, GALIH_NIP)
    assert res.status_code == 403
    assert res.json()["message"] == (
        "Menunjuk operator hanya dapat dilakukan Pejabat (Pokja: Pengisi)."
    )
    revoke = rafi.post(f"/api/v1/delegates/{uid('del-rafi-a1')}/revoke")
    assert revoke.status_code == 403


def test_existing_operator_refused(demo: None) -> None:
    res = _appoint(client_for("usr-andi"), user("usr-rafi").nip)
    assert res.status_code == 422
    assert res.json()["message"].startswith("Pegawai ini sudah Operator ")


def test_revoke_operator(demo: None) -> None:
    epoch = user("usr-rafi").auth_epoch
    res = client_for("usr-andi").post(f"/api/v1/delegates/{uid('del-rafi-a1')}/revoke")
    assert res.status_code == 204
    assert PositionDelegate.objects.get(pk=uid("del-rafi-a1")).end_reason == "revoked"
    assert user("usr-rafi").auth_epoch == epoch + 1
    assert AuditLog.objects.filter(action="cabut_operator").exists()


def test_my_positions_cards(demo: None) -> None:
    mine = client_for("usr-andi").get("/api/v1/me/positions").json()
    card = mine["officials"][0]
    assert card["positionId"] == uid("pos-ppk-a1")
    assert card["canManage"] is True
    assert [o["fullName"] for o in card["operators"]] == ["Rafi Ananda"]
    assert mine["operatorOf"] == []


def test_delegations_task_expires(demo: None) -> None:
    PositionDelegate.objects.filter(pk=uid("del-rafi-a1")).update(end_date=dt.date(2027, 4, 1))
    epoch = user("usr-rafi").auth_epoch
    scheduler.run_all(clock.now())
    assert PositionDelegate.objects.get(pk=uid("del-rafi-a1")).end_reason == "expired"
    assert user("usr-rafi").auth_epoch == epoch + 1
