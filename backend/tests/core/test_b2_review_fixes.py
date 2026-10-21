"""Final-review findings of B2: locks under concurrency and missing rows as 404, not 500."""

import uuid
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from simario.calendar.models import FiscalYear
from tests.demo import client_for, uid


def _locked(queries: CaptureQueriesContext, table: str) -> bool:
    return any(
        "FOR UPDATE" in q["sql"] and f'FROM "{table}"' in q["sql"] for q in queries.captured_queries
    )


def test_assignments_lock_target_positions(demo: None) -> None:
    """INV-14: a target without assignments is locked too, so two managers cannot both pass."""
    admin = client_for("usr-admin")
    with CaptureQueriesContext(connection) as queries:
        res = admin.post(
            "/api/v1/monitoring-assignments",
            {
                "targetPositionIds": [uid("pos-ppk-b2")],
                "leadPositionId": uid("pos-pj-pemantauan"),
                "supports": [],
                "quarterFromId": uid("q-2027-2"),
                "quarterToId": uid("q-2027-4"),
                "decreeNo": "KEP-93/2027",
            },
            format="json",
        )
    assert res.status_code == 204
    assert _locked(queries, "org_position")


def test_data_umum_save_locks_position_type(demo: None) -> None:
    """The version number is computed under a lock (aggregate() drops FOR UPDATE)."""
    nur = client_for("usr-nur")
    with CaptureQueriesContext(connection) as queries:
        res = nur.post(
            f"/api/v1/position-types/{uid('pt-ppk')}/data-umum-forms",
            {"defaultObjective": "", "fields": [], "objectiveEnabled": False},
            format="json",
        )
    assert res.status_code == 200
    assert _locked(queries, "org_positiontype")


def test_unknown_id_is_not_found(demo: None) -> None:
    res = client_for("usr-nur").patch(
        f"/api/v1/stages/{uuid.uuid4()}", {"name": "X"}, format="json"
    )
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"


def test_unknown_role_id_is_not_found(demo: None) -> None:
    res = client_for("usr-admin").put(
        f"/api/v1/users/{uid('usr-andi')}/roles", {"roleIds": [str(uuid.uuid4())]}, format="json"
    )
    assert res.status_code == 404


def test_fiscal_year_insert_race_keeps_prototype_message(
    demo: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Another manager created the year between the check and the insert."""
    real = FiscalYear.objects.filter

    def stale(*args: Any, **kwargs: Any) -> Any:
        qs = real(*args, **kwargs)
        if kwargs.get("pk") == 2027:
            return qs.none()
        return qs

    monkeypatch.setattr(FiscalYear.objects, "filter", stale)
    res = client_for("usr-admin").post("/api/v1/fiscal-years", {"year": 2027}, format="json")
    assert res.status_code == 422
    assert res.json()["message"] == "TA 2027 sudah ada."
