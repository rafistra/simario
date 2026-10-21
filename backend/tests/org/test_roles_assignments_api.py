from simario.accounts.selectors import load_access_db
from simario.audit.models import AuditLog
from simario.domain import access
from simario.org.models import MonitoringAssignment, RolePermission
from tests.demo import client_for, uid, user

TODAY = "2027-04-06"


def test_keeps_one_role_manager(demo: None) -> None:
    res = client_for("usr-admin").post(f"/api/v1/users/{uid('usr-admin')}/deactivate")
    assert res.status_code == 409
    assert res.json()["code"] == "inv5"


def test_superadmin_locked_permission_10_guarded_in_use_role(demo: None) -> None:
    admin = client_for("usr-admin")
    locked = admin.put(
        f"/api/v1/roles/{uid('role-sad')}/permissions/1",
        {"enabled": False, "scope": None},
        format="json",
    )
    assert locked.status_code == 409 and locked.json()["code"] == "locked"
    assert locked.json()["message"] == "Peran terkunci dan hanya dapat dibaca."
    p10 = admin.put(
        f"/api/v1/roles/{uid('role-pmt')}/permissions/10",
        {"enabled": True, "scope": "semua"},
        format="json",
    )
    assert p10.status_code == 422
    assert p10.json()["message"] == (
        "Izin 10 hanya dapat diberikan pada peran bawaan jenis jabatan Lini 3 dan Superadmin."
    )
    in_use = admin.delete(f"/api/v1/roles/{uid('role-pmr')}")
    assert in_use.status_code == 409 and in_use.json()["code"] == "in_use"
    assert admin.delete(f"/api/v1/roles/{uid('role-sad')}").json()["code"] == "locked"

    created = admin.post("/api/v1/roles", {"name": "Pembaca Audit"}, format="json")
    assert created.status_code == 201
    role_id = created.json()["id"]
    dup = admin.post("/api/v1/roles", {"name": "pembaca audit"}, format="json")
    assert dup.json()["message"] == "Nama peran sudah dipakai."
    ok = admin.put(
        f"/api/v1/roles/{role_id}/permissions/23",
        {"enabled": True, "scope": "unit"},
        format="json",
    )
    assert ok.status_code == 204
    assert RolePermission.objects.get(role_id=role_id, permission_id=23).scope == "unit"
    assert AuditLog.objects.filter(action="ubah_izin_peran").exists()
    assert admin.delete(f"/api/v1/roles/{role_id}").status_code == 204
    assert AuditLog.objects.filter(action="hapus_peran").exists()


def test_permission_change_ends_sessions_of_role_holders(demo: None) -> None:
    siti_epoch = user("usr-siti").auth_epoch
    andi_epoch = user("usr-andi").auth_epoch
    res = client_for("usr-admin").put(
        f"/api/v1/roles/{uid('role-pmt')}/permissions/23",
        {"enabled": True, "scope": "unit"},
        format="json",
    )
    assert res.status_code == 204
    assert user("usr-siti").auth_epoch == siti_epoch + 1
    assert user("usr-andi").auth_epoch == andi_epoch


def test_second_lead_overlapping_quarter_refused(demo: None) -> None:
    res = client_for("usr-admin").post(
        "/api/v1/monitoring-assignments",
        {
            "targetPositionIds": [uid("pos-ppk-a2")],
            "leadPositionId": uid("pos-pj-pemantauan"),
            "supports": [],
            "quarterFromId": uid("q-2027-4"),
            "quarterToId": uid("q-2027-4"),
            "decreeNo": "K",
        },
        format="json",
    )
    assert res.status_code == 409
    assert res.json()["code"] == "inv14"
    assert res.json()["message"] == "PPK A-2 sudah memiliki penanggung jawab pada TW IV TA 2027."


def test_assignment_change_updates_lini2_scope(demo: None) -> None:
    siti = user("usr-siti")
    siti_client = client_for("usr-siti")
    admin = client_for("usr-admin")
    ppk = uid("pos-ppk-a1")
    assert access.can_read_position(load_access_db(), str(siti.id), ppk, TODAY, 2027)
    assert admin.delete(f"/api/v1/monitoring-assignments/{uid('asg-2027-1')}").status_code == 204
    assert not access.can_read_position(load_access_db(), str(siti.id), ppk, TODAY, 2027)
    assert siti_client.get("/api/v1/me").status_code == 401
    assert AuditLog.objects.filter(action="hapus_penugasan").exists()

    res = admin.post(
        "/api/v1/monitoring-assignments",
        {
            "targetPositionIds": [ppk],
            "leadPositionId": uid("pos-pj-pemantauan"),
            "supports": [{"positionId": uid("pos-sup-ukpbj"), "domain": "procurement"}],
            "quarterFromId": uid("q-2027-1"),
            "quarterToId": uid("q-2027-4"),
            "decreeNo": "KEP-92/2027",
        },
        format="json",
    )
    assert res.status_code == 204
    created = MonitoringAssignment.objects.get(target_position__id=ppk, decree_no="KEP-92/2027")
    assert [s.domain for s in created.supports.all()] == ["procurement"]
    assert access.can_read_position(load_access_db(), str(siti.id), ppk, TODAY, 2027)


def test_assignments_need_permission_20(demo: None) -> None:
    res = client_for("usr-andi").delete(f"/api/v1/monitoring-assignments/{uid('asg-2027-1')}")
    assert res.status_code == 403
