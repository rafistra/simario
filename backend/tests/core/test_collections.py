from rest_framework.test import APIClient

from simario.core.permissions import require_permission
from tests.demo import client_for, user

BASE = "/api/v1/collections"


def test_collection_positions_shape(demo: None) -> None:
    rows = client_for("usr-nur").get(f"{BASE}/positions").json()
    assert len(rows) == 12
    a1 = next(r for r in rows if r["code"] == "PPKA1")
    assert {"orgUnitId", "positionTypeId", "identity", "shortName"} <= set(a1)


def test_collection_users_has_no_password(demo: None) -> None:
    rows = client_for("usr-admin").get(f"{BASE}/users").json()
    assert rows and all("password" not in r for r in rows)
    andi = next(r for r in rows if r["nip"] == "198204172008011003")
    assert andi["fullName"] == "Andi Wirawan" and andi["active"] is True


def test_collection_requires_session(demo: None) -> None:
    assert APIClient().get(f"{BASE}/positions").status_code == 401


def test_unknown_collection_is_404(demo: None) -> None:
    assert client_for("usr-nur").get(f"{BASE}/rahasia").status_code == 404


def test_assignments_include_supports(demo: None) -> None:
    rows = client_for("usr-admin").get(f"{BASE}/assignments").json()
    assert any(len(r["supports"]) == 2 for r in rows)
    assert {"positionId", "domain"} <= set(rows[0]["supports"][0])


def test_score_bands_are_numbers(demo: None) -> None:
    rows = client_for("usr-nur").get(f"{BASE}/scoreBands").json()
    assert any(r["lowerExclusive"] is None for r in rows)
    assert all(isinstance(r["upperInclusive"], int | float) for r in rows)


def test_require_permission_actor_label(demo: None) -> None:
    assert require_permission(user("usr-nur"), 12).acting_as == "pengelola"
    assert require_permission(user("usr-admin"), 21).acting_as == "superadmin"
