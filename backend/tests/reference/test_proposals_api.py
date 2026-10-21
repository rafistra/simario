from simario.audit.models import AuditLog
from simario.notifications.models import Notification
from simario.reference.models import RiskProposal, RiskTemplate
from tests.demo import client_for

URL = "/api/v1/proposals"


def _pending() -> RiskProposal:
    p = RiskProposal.objects.filter(status="pending").first()
    assert p is not None
    return p


def test_list_carries_source_context(demo: None) -> None:
    res = client_for("usr-nur").get(URL, {"status": "pending"})
    assert res.status_code == 200
    rows = res.json()
    assert rows and all(r["status"] == "pending" for r in rows)
    assert {"positionName", "stageName", "riskType", "proposerName", "mitigations"} <= set(rows[0])
    assert client_for("usr-andi").get(URL).status_code == 403


def test_reject_needs_reason_and_notifies(demo: None) -> None:
    nur = client_for("usr-nur")
    p = _pending()
    blank = nur.post(f"{URL}/{p.id}/reject", {"reason": " "}, format="json")
    assert blank.json()["message"] == "Alasan penolakan wajib diisi."
    assert (
        nur.post(f"{URL}/{p.id}/reject", {"reason": "Tercakup."}, format="json").status_code == 204
    )
    p.refresh_from_db()
    assert p.status == "rejected" and p.rejection_reason == "Tercakup."
    assert Notification.objects.filter(user=p.proposer, kind="proposal_rejected").exists()
    again = nur.post(f"{URL}/{p.id}/reject", {"reason": "x"}, format="json")
    assert again.status_code == 409


def test_accept_makes_template(demo: None) -> None:
    p = _pending()
    risk = p.source_register_risk
    body = {
        "positionTypeId": str(risk.register.position.position_type_id),
        "stageId": str(risk.stage_id),
        "riskType": risk.risk_type,
        "description": p.description,
        "mitigations": ["Mitigasi usulan"],
    }
    res = client_for("usr-nur").post(f"{URL}/{p.id}/accept", body, format="json")
    assert res.status_code == 200
    assert RiskTemplate.objects.filter(pk=res.json()["id"], description=p.description).exists()
    p.refresh_from_db()
    assert p.status == "accepted"
    assert AuditLog.objects.filter(action="terima_usulan").exists()
    assert Notification.objects.filter(user=p.proposer, kind="proposal_accepted").exists()
