import pytest

from simario.audit.models import AuditLog
from simario.devtools.seed import legacy_uuid
from simario.reference.models import MitigationTemplate, RiskTemplate, Stage
from simario.registers import usage
from tests.demo import client_for, uid


def test_stage_names_unique_per_type_and_used_stage_not_deleted(
    demo: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    nur = client_for("usr-nur")
    dup = nur.post(
        "/api/v1/stages", {"positionTypeId": uid("pt-ppk"), "name": "perencanaan pengadaan"}
    )
    assert dup.json()["message"] == "Nama tahap sudah dipakai pada jenis ini."
    new = nur.post("/api/v1/stages", {"positionTypeId": uid("pt-ppk"), "name": "Serah Terima"})
    assert new.status_code == 200
    stage_id = new.json()["id"]
    monkeypatch.setattr(usage, "stage_used", lambda _id: True)
    used = nur.delete(f"/api/v1/stages/{stage_id}")
    assert used.json()["code"] == "stage_in_use"
    monkeypatch.setattr(usage, "stage_used", lambda _id: False)
    with_templates = nur.delete(f"/api/v1/stages/{uid('stg-PPK-T1')}")
    assert with_templates.json()["code"] == "stage_has_templates"
    assert nur.delete(f"/api/v1/stages/{stage_id}").status_code == 204
    assert not Stage.objects.filter(pk=stage_id).exists()


def test_rename_and_toggle_stage(demo: None) -> None:
    nur = client_for("usr-nur")
    stage = uid("stg-PPK-T1")
    assert nur.patch(f"/api/v1/stages/{stage}", {"name": "  "}).json()["message"] == (
        "Nama tahap wajib diisi."
    )
    assert nur.patch(f"/api/v1/stages/{stage}", {"name": "Perencanaan"}).status_code == 204
    assert Stage.objects.get(pk=stage).name == "Perencanaan"
    assert nur.patch(f"/api/v1/stages/{stage}", {"active": False}).status_code == 204
    assert AuditLog.objects.filter(action="nonaktifkan_tahap").exists()


def test_reorder_saves_immediately(demo: None) -> None:
    nur = client_for("usr-nur")
    stages = list(
        Stage.objects.filter(position_type_id=legacy_uuid("pt-ppk"), active=True).order_by("order")
    )
    reversed_ids = [str(s.id) for s in reversed(stages)]
    res = nur.put(
        f"/api/v1/position-types/{uid('pt-ppk')}/stage-order", {"orderedIds": reversed_ids}
    )
    assert res.status_code == 204
    assert Stage.objects.get(pk=reversed_ids[0]).order == 1
    assert AuditLog.objects.filter(action="urutkan_tahap").exists()


def test_save_template_and_wording_keeps_code(demo: None) -> None:
    nur = client_for("usr-nur")
    body = {
        "positionTypeId": uid("pt-ppk"),
        "stageId": uid("stg-PPK-T1"),
        "riskType": "kinerja_anggaran",
        "description": "Risiko   baru  uji",
        "mitigations": ["Mitigasi satu", "  ", "Mitigasi dua"],
    }
    created = nur.post("/api/v1/risk-templates", body)
    assert created.status_code == 200
    tpl = RiskTemplate.objects.get(pk=created.json()["id"])
    assert tpl.description == "Risiko baru uji"
    assert [m.code for m in tpl.mitigations.order_by("order")] == [
        f"{tpl.code}-M1",
        f"{tpl.code}-M2",
    ]
    dup = nur.post("/api/v1/risk-templates", body)
    assert dup.json()["message"] == "Uraian ini sudah ada pada tahap dan jenis risiko yang sama."
    edited = nur.put(f"/api/v1/risk-templates/{tpl.id}", {**body, "description": "Uraian ubah"})
    assert edited.status_code == 200
    tpl.refresh_from_db()
    assert tpl.description == "Uraian ubah" and tpl.code == RiskTemplate.objects.get(pk=tpl.id).code
    assert AuditLog.objects.filter(action="ubah_template").exists()


def test_used_template_cannot_be_deleted(demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
    nur = client_for("usr-nur")
    tpl = uid("tpl-PPK-T4-FR-03")
    assert nur.patch(f"/api/v1/risk-templates/{tpl}", {"active": False}).status_code == 204
    monkeypatch.setattr(usage, "template_ever_used", lambda _id: True)
    assert nur.delete(f"/api/v1/risk-templates/{tpl}").json()["code"] == "template_used"
    monkeypatch.setattr(usage, "template_ever_used", lambda _id: False)
    assert nur.delete(f"/api/v1/risk-templates/{tpl}").status_code == 204
    assert not MitigationTemplate.objects.filter(
        risk_template_id=legacy_uuid("tpl-PPK-T4-FR-03")
    ).exists()


def test_template_usage_endpoint(demo: None) -> None:
    res = client_for("usr-nur").get("/api/v1/risk-templates/usage?fiscalYear=2027")
    assert res.status_code == 200
    assert res.json()[uid("tpl-PPK-T3-KP-02")] >= 1


def test_lini1_cannot_rename_stage(demo: None) -> None:
    res = client_for("usr-andi").patch(f"/api/v1/stages/{uid('stg-PPK-T1')}", {"name": "X"})
    assert res.json()["code"] == "forbidden"
