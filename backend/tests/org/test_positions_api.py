from simario.audit.models import AuditLog
from simario.notifications.models import Notification
from simario.org.models import Position, PositionDelegate
from tests.demo import client_for, uid, user


def test_lini1_user_cannot_write_master_data(demo: None) -> None:
    res = client_for("usr-andi").patch(
        f"/api/v1/position-types/{uid('pt-pokja')}", {"active": False}, format="json"
    )
    assert res.status_code == 403
    assert res.json()["code"] == "forbidden"


def test_type_in_use_refuses_deactivation(demo: None) -> None:
    res = client_for("usr-admin").patch(
        f"/api/v1/position-types/{uid('pt-pokja')}", {"active": False}, format="json"
    )
    assert res.status_code == 409
    body = res.json()
    assert body["code"] == "type_in_use"
    assert body["details"]["positions"] == [uid("pos-pokja-03")]
    assert body["details"]["runningRegisters"] == 1  # Pokja 03 TA 2027 (draft)


def test_duplicate_code_within_unit(demo: None) -> None:
    client = client_for("usr-admin")
    body = {
        "positionTypeId": uid("pt-ppk"),
        "code": "ppka1",
        "name": "PPK A-9",
        "orgUnitId": uid("ou-ddkb"),
        "identity": {},
    }
    dup = client.post("/api/v1/positions", body, format="json")
    assert dup.status_code == 422
    assert dup.json()["details"]["code"] == "Kode jabatan sudah dipakai."
    ok = client.post(
        "/api/v1/positions", {**body, "code": "PPKA3", "name": "PPK A-3"}, format="json"
    )
    assert ok.status_code == 200
    assert Position.objects.get(pk=ok.json()["id"]).active is True
    assert AuditLog.objects.filter(action="tambah_jabatan").exists()


def test_update_position_audits_before_after(demo: None) -> None:
    client = client_for("usr-admin")
    pos = Position.objects.get(pk=uid("pos-ppk-a2"))
    res = client.put(
        f"/api/v1/positions/{pos.id}",
        {
            "positionTypeId": str(pos.position_type_id),
            "code": pos.code,
            "name": "PPK A-2 Baru",
            "orgUnitId": str(pos.org_unit_id),
            "identity": pos.identity,
        },
        format="json",
    )
    assert res.status_code == 200
    entry = AuditLog.objects.get(action="ubah_jabatan")
    assert entry.before is not None and entry.after is not None
    assert entry.before["name"] == "PPK A-2" and entry.after["name"] == "PPK A-2 Baru"


def test_deactivate_position_ends_operators_and_audits(demo: None) -> None:
    admin = client_for("usr-admin")
    dimas = client_for("usr-dimas")
    assert dimas.get("/api/v1/me").status_code == 200
    blank = admin.post(
        f"/api/v1/positions/{uid('pos-ppk-a2')}/deactivate", {"reason": " "}, format="json"
    )
    assert blank.json()["message"] == "Alasan penonaktifan wajib diisi."
    res = admin.post(
        f"/api/v1/positions/{uid('pos-ppk-a2')}/deactivate",
        {"reason": "Digabung ke PPK A-1."},
        format="json",
    )
    assert res.status_code == 204
    assert Position.objects.get(pk=uid("pos-ppk-a2")).active is False
    assert PositionDelegate.objects.get(pk=uid("del-dimas-a2")).end_reason == "revoked"
    last = AuditLog.objects.order_by("-at").first()
    assert last is not None and last.action == "nonaktifkan_jabatan"
    assert last.entity_id == uid("pos-ppk-a2")
    assert Notification.objects.filter(user=user("usr-dimas"), kind="operator_revoked").exists()
    assert dimas.get("/api/v1/me").status_code == 401


def test_reactivate_and_impact(demo: None) -> None:
    admin = client_for("usr-admin")
    admin.post(f"/api/v1/positions/{uid('pos-ppk-a1')}/deactivate", {"reason": "x"}, format="json")
    assert admin.post(f"/api/v1/positions/{uid('pos-ppk-a1')}/reactivate").status_code == 204
    assert Position.objects.get(pk=uid("pos-ppk-a1")).deactivation_reason is None
    impact = admin.get(f"/api/v1/positions/{uid('pos-ppk-a2')}/impact").json()
    assert impact["activeOperators"] == 1
    assert [r["fiscalYear"] for r in impact["publishedRegisters"]] == [2027]


def test_identity_keys_are_data_not_camelized(demo: None) -> None:
    rows = client_for("usr-nur").get("/api/v1/collections/positions").json()
    kpa = next(r for r in rows if r["code"] == "KPA-A")
    assert "nama_satker" in kpa["identity"]
