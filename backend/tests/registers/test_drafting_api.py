"""Ports of the drafting cases in frontend/src/data/api/register.test.ts."""

from typing import Any

from simario.audit.models import AuditLog
from simario.notifications.models import Notification
from simario.reference.models import MitigationTemplate
from simario.registers.models import (
    Register,
    RegisterMitigation,
    RegisterRisk,
    RegisterStageDeclaration,
)
from tests.demo import client_for, uid, user

A1 = f"/api/v1/registers/{uid('pos-ppk-a1')}/2027"
KPA = f"/api/v1/registers/{uid('pos-kpa-satker-a')}/2027"
POKJA = f"/api/v1/registers/{uid('pos-pokja-03')}/2027"


def _select(persona: str, base: str, template: str, selected: bool = True) -> Any:
    return client_for(persona).put(
        f"{base}/template-risks/{uid(template)}", {"selected": selected}, format="json"
    )


def _kpa() -> Register | None:
    return Register.objects.filter(position_id=uid("pos-kpa-satker-a"), fiscal_year_id=2027).first()


def test_pokja_member_cannot_draft(demo: None) -> None:
    res = _select("usr-ratna", POKJA, "tpl-POKJA-T1-KA-01")
    assert res.status_code == 403
    assert res.json()["message"] == (
        "Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun register ini."
    )


def test_archived_year_refuses_edits(demo: None) -> None:
    res = client_for("usr-andi").patch(
        f"/api/v1/registers/{uid('pos-ppk-a1')}/2026", {"target": "x"}, format="json"
    )
    assert res.status_code == 409 and res.json()["code"] == "archived"


def test_first_edit_creates_register_and_template_mitigations_not_preticked(demo: None) -> None:
    assert _select("usr-hadi", KPA, "tpl-KPA-T1-KA-01").status_code == 204
    reg = _kpa()
    assert reg is not None and reg.status == "draft"
    risk = RegisterRisk.objects.get(register=reg, risk_template__id=uid("tpl-KPA-T1-KA-01"))
    assert not RegisterMitigation.objects.filter(register_risk=risk).exists()
    assert AuditLog.objects.filter(action="buat_register").exists()
    assert AuditLog.objects.filter(action="pilih_risiko", acting_as="pejabat").exists()
    assert _select("usr-hadi", KPA, "tpl-KPA-T1-KA-01", False).status_code == 204
    assert not RegisterRisk.objects.filter(pk=risk.pk).exists()


def test_declaration_asks_before_removing_draft_risks(demo: None) -> None:
    _select("usr-hadi", KPA, "tpl-KPA-T1-KA-01")
    hadi = client_for("usr-hadi")
    decl = {"stageId": uid("stg-KPA-T1"), "riskType": "kinerja_anggaran", "on": True}
    asked = hadi.put(f"{KPA}/declarations", decl, format="json")
    assert asked.status_code == 409
    assert asked.json()["code"] == "has_drafts"
    assert asked.json()["details"] == {"count": 1}
    assert (
        hadi.put(f"{KPA}/declarations", {**decl, "force": True}, format="json").status_code == 204
    )
    reg = _kpa()
    assert not RegisterRisk.objects.filter(register=reg).exists()
    assert RegisterStageDeclaration.objects.filter(register=reg, kind="no_risk_in_type").exists()
    reason = hadi.patch(f"{KPA}/declarations", {**decl, "reason": "Tidak berlaku."}, format="json")
    assert reason.status_code == 204
    assert RegisterStageDeclaration.objects.get(register=reg).reason == "Tidak berlaku."


def test_custom_risk_and_mitigation(demo: None) -> None:
    hadi = client_for("usr-hadi")
    res = hadi.post(
        f"{KPA}/risks",
        {"stageId": uid("stg-KPA-T1"), "riskType": "kecurangan", "description": "  Risiko   baru "},
        format="json",
    )
    assert res.status_code == 201
    risk = RegisterRisk.objects.get(pk=res.json()["id"])
    assert risk.is_custom and risk.description_snapshot == "Risiko baru"
    empty = hadi.post(f"/api/v1/register-risks/{risk.id}/mitigations", {"text": " "}, format="json")
    assert empty.json()["message"] == "Uraian mitigasi wajib diisi."
    hadi.post(f"/api/v1/register-risks/{risk.id}/mitigations", {"text": "Cek"}, format="json")
    assert RegisterMitigation.objects.filter(register_risk=risk, is_custom=True).count() == 1


def test_operator_edit_returns_ready_register_to_draft_and_notifies(demo: None) -> None:
    rafi = client_for("usr-rafi")
    risk = RegisterRisk.objects.get(pk=uid("rr-a1-material"))
    mtpl = MitigationTemplate.objects.filter(risk_template_id=risk.risk_template_id).first()
    assert mtpl is not None
    res = rafi.put(
        f"/api/v1/register-risks/{risk.id}/template-mitigations/{mtpl.id}",
        {"selected": True},
        format="json",
    )
    assert res.status_code == 204
    assert rafi.post(f"{A1}/mark-ready").status_code == 204
    assert Notification.objects.filter(
        user=user("usr-andi"), text__contains="siap untuk Anda tuntaskan"
    ).exists()
    assert not RegisterMitigation.objects.filter(register_risk=risk, status="draft").exists()


def test_data_umum_patch_merges_extra(demo: None) -> None:
    andi = client_for("usr-andi")
    res = andi.patch(
        A1, {"besarAnggaran": 5000000, "extra": {"sumber_dana": "APBN"}}, format="json"
    )
    assert res.status_code == 204
    reg = Register.objects.get(position_id=uid("pos-ppk-a1"), fiscal_year_id=2027)
    assert reg.data_umum["besar_anggaran"] == 5000000
    assert reg.data_umum["extra"]["sumber_dana"] == "APBN"
    assert AuditLog.objects.filter(action="ubah_data_umum").exists()
