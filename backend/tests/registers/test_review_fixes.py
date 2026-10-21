"""Final-review findings of B3: locks under concurrency and copy over an existing declaration."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from simario.registers.models import RegisterStageDeclaration
from tests.demo import client_for, uid

KPA = f"/api/v1/registers/{uid('pos-kpa-satker-a')}/2027"


def _locked(queries: CaptureQueriesContext, table: str) -> bool:
    return any(
        "FOR UPDATE" in q["sql"] and f'FROM "{table}"' in q["sql"] for q in queries.captured_queries
    )


def test_first_edit_locks_the_position(demo: None) -> None:
    """No register row exists yet, so the position row serialises two first edits."""
    with CaptureQueriesContext(connection) as queries:
        res = client_for("usr-hadi").put(
            f"{KPA}/template-risks/{uid('tpl-KPA-T1-KA-01')}", {"selected": True}, format="json"
        )
    assert res.status_code == 204
    assert _locked(queries, "org_position")


def test_risk_mutations_lock_the_register(demo: None) -> None:
    """Edits by risk id wait for a publish in progress (INV-7)."""
    andi = client_for("usr-andi")
    rid = andi.post(
        f"/api/v1/registers/{uid('pos-ppk-a1')}/2027/risks",
        {"stageId": uid("stg-PPK-T1"), "riskType": "kecurangan", "description": "Baru"},
        format="json",
    ).json()["id"]
    with CaptureQueriesContext(connection) as queries:
        assert andi.delete(f"/api/v1/register-risks/{rid}").status_code == 204
    assert _locked(queries, "registers_register")


def test_copy_over_an_existing_declaration(demo: None) -> None:
    hadi = client_for("usr-hadi")
    prev = RegisterStageDeclaration.objects.filter(
        register__position_id=uid("pos-kpa-satker-a"), register__fiscal_year_id=2026
    ).first()
    assert prev is not None
    res = hadi.put(
        f"{KPA}/declarations",
        {"stageId": str(prev.stage_id), "riskType": prev.risk_type, "on": True},
        format="json",
    )
    assert res.status_code == 204
    copied = hadi.post(f"{KPA}/copy-from-previous")
    assert copied.status_code == 200, copied.json()
