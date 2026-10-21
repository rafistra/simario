"""Ports of the publishing, deactivation and copy cases in register.test.ts."""

import datetime as dt

from simario.assessments.models import RiskQuarter
from simario.audit.models import AuditLog
from simario.core import clock, scheduler
from simario.notifications.models import Notification
from simario.reference.models import RiskProposal
from simario.registers.models import Register, RegisterRisk
from tests.demo import client_for, uid

A1 = f"/api/v1/registers/{uid('pos-ppk-a1')}/2027"
KPA = f"/api/v1/registers/{uid('pos-kpa-satker-a')}/2027"


def test_gaps_block_with_numbered_list(demo: None) -> None:
    hadi = client_for("usr-hadi")
    hadi.put(f"{KPA}/template-risks/{uid('tpl-KPA-T1-KA-01')}", {"selected": True}, format="json")
    res = hadi.post(f"{KPA}/publish")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "gaps"
    assert body["message"].startswith("Register belum dapat diterbitkan: ")
    assert body["message"].endswith(" hal perlu dilengkapi")
    messages = [g["message"] for g in body["details"]]
    assert "Data Umum — Kegiatan wajib diisi sebelum register diterbitkan." in messages
    assert any("belum ada risiko atau pernyataan" in m for m in messages)
    assert not any("Tujuan" in m for m in messages)
    reg = Register.objects.get(position_id=uid("pos-kpa-satker-a"), fiscal_year_id=2027)
    assert reg.status == "draft"


def test_operator_cannot_publish(demo: None) -> None:
    res = client_for("usr-rafi").post(f"{A1}/publish")
    assert res.status_code == 403
    assert res.json()["message"] == "Tindakan akhir dilakukan oleh Pejabat."


def test_publish_additions_side_effects(demo: None) -> None:
    andi = client_for("usr-andi")
    created = andi.post(
        f"{A1}/risks",
        {"stageId": uid("stg-PPK-T1"), "riskType": "kecurangan", "description": "Risiko baru"},
        format="json",
    ).json()["id"]
    pending = list(
        RegisterRisk.objects.filter(
            register__position_id=uid("pos-ppk-a1"),
            register__fiscal_year_id=2027,
            status__in=["draft", "ready"],
        ).values_list("id", flat=True)
    )
    res = andi.post(f"{A1}/publish")
    assert res.status_code == 200, res.json()
    summary = res.json()
    assert summary["risks"] == len(pending) and summary["proposals"] >= 1
    assert {f["id"] for f in summary["flagged"]} >= {created}
    risk = RegisterRisk.objects.get(pk=created)
    assert risk.status == "active" and risk.published_at is not None
    assert "no_mitigation" in risk.flags
    assert RiskQuarter.objects.filter(register_risk=risk, quarter_id=uid("q-2027-2")).exists()
    assert RiskProposal.objects.filter(source_register_risk=risk, status="pending").exists()
    published = Notification.objects.filter(kind="register_published")
    assert published.count() >= 1
    assert published.values("user").distinct().count() == published.count()
    assert AuditLog.objects.filter(action="terbitkan_tambahan").exists()
    again = andi.post(f"{A1}/publish")
    assert again.status_code == 409 and again.json()["code"] == "nothing"


def test_deactivate_from_next_quarter(demo: None) -> None:
    andi = client_for("usr-andi")
    url = f"/api/v1/register-risks/{uid('rr-a1-pembayaran')}/deactivate"
    blank = andi.post(url, {"reason": "  "}, format="json")
    assert blank.json()["message"] == "Alasan penonaktifan wajib diisi."
    assert (
        andi.post(url, {"reason": "Sudah dipantau melalui SPAN."}, format="json").status_code == 204
    )
    risk = RegisterRisk.objects.get(pk=uid("rr-a1-pembayaran"))
    assert risk.status == "inactive"
    assert str(risk.deactivated_from_quarter_id) == uid("q-2027-3")
    assert client_for("usr-rafi").post(url, {"reason": "x"}, format="json").status_code == 403


def test_deactivate_in_tw4_keeps_rest_of_year(demo: None) -> None:
    clock.set_now(clock.parse_local("2027-11-02T09:00"))
    url = f"/api/v1/register-risks/{uid('rr-a1-pembayaran')}/deactivate"
    assert (
        client_for("usr-andi").post(url, {"reason": "Paket selesai."}, format="json").status_code
        == 204
    )
    assert RegisterRisk.objects.get(pk=uid("rr-a1-pembayaran")).deactivated_from_quarter is None


def test_copy_previous_year_as_drafts(demo: None) -> None:
    hadi = client_for("usr-hadi")
    res = hadi.post(f"{KPA}/copy-from-previous")
    assert res.status_code == 200
    summary = res.json()
    assert summary["fromYear"] == 2026 and summary["risks"] > 0
    reg = Register.objects.get(position_id=uid("pos-kpa-satker-a"), fiscal_year_id=2027)
    assert reg.status == "draft" and reg.data_umum["besar_anggaran"] is None
    risks = RegisterRisk.objects.filter(register=reg)
    assert risks.count() == summary["risks"]
    assert all(r.status == "draft" and r.published_at is None for r in risks)
    assert any("template_inactive" in r.flags for r in risks) == (summary["inactiveTemplates"] > 0)
    again = hadi.post(f"{KPA}/copy-from-previous")
    assert again.status_code == 409 and again.json()["code"] == "not_empty"


def test_risk_quarters_task_is_idempotent(demo: None) -> None:
    RiskQuarter.objects.filter(quarter_id=uid("q-2027-2")).delete()
    at = clock.now() + dt.timedelta(minutes=1)
    scheduler.run_all(at)
    created = RiskQuarter.objects.filter(quarter_id=uid("q-2027-2")).count()
    assert created > 0
    scheduler.run_all(at)
    assert RiskQuarter.objects.filter(quarter_id=uid("q-2027-2")).count() == created
