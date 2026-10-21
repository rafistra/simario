"""The audit trail (FR-ADM-008, VIS-8) on the demo seed."""

from typing import Any

from simario.audit.models import AuditLog
from tests.demo import client_for, uid

KEP = uid("pos-kepatuhan")


def _audit(persona: str, query: str = "") -> Any:
    return client_for(persona).get(f"/api/v1/audit{query}")


def test_audit_redacts_blind_scores(demo: None) -> None:
    """Hendra saves a TW II draft (blind until opening): the audit shows [disamarkan]."""
    rq = uid("rq-rr-a1-material-q-2027-2")
    res = client_for("usr-hendra").patch(
        f"/api/v1/risk-quarters/{rq}/assessments/{KEP}", {"score": 1}, format="json"
    )
    assert res.status_code == 204
    rows = _audit("usr-admin", "?action=simpan_draf_penilaian").json()
    mine = [r for r in rows if r["actorUserId"] == uid("usr-hendra")]
    assert mine and mine[0]["after"]["score"] == "[disamarkan]"
    assert mine[0]["actorName"] == "Hendra Gunawan"


def test_original_needs_24_and_is_logged(demo: None) -> None:
    denied = _audit("usr-hendra", "?original=1")
    assert denied.status_code == 403
    before = AuditLog.objects.filter(action="tampilkan_nilai_asli").count()
    ok = _audit("usr-admin", "?original=1")
    assert ok.status_code == 200
    assert AuditLog.objects.filter(action="tampilkan_nilai_asli").count() == before + 1


def test_audit_scope_and_filters(demo: None) -> None:
    assert _audit("usr-rafi").status_code == 403
    admin = _audit("usr-admin").json()
    assert len(admin) >= 5
    hendra = _audit("usr-hendra")
    if hendra.status_code == 200:
        assert len(hendra.json()) <= len(admin)
    since = _audit("usr-admin", "?from=2027-04-01").json()
    assert all(r["at"][:10] >= "2027-04-01" for r in since)
    facets = client_for("usr-admin").get("/api/v1/audit/facets").json()
    assert "terbitkan_register" in facets["actions"] and facets["entityTypes"]


def test_confidential_names_and_blind_values_redacted() -> None:
    from simario.insights.audit_trail import _walk

    entry = {"files": ["rahasia.pdf", "umum.pdf"], "score": 2, "note": "x", "reason": "y"}
    assert _walk(entry, False, {"rahasia.pdf"}) == {
        "files": ["[konfidensial]", "umum.pdf"],
        "score": 2,
        "note": "x",
        "reason": "y",
    }
    assert _walk(entry, True, set()) == {
        "files": ["rahasia.pdf", "umum.pdf"],
        "score": "[disamarkan]",
        "note": "[disamarkan]",
        "reason": "y",
    }
