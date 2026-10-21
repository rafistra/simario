from collections.abc import Callable
from typing import Any

import pytest

from simario.domain import access
from tests.vectors import load_vectors

VECTORS = load_vectors("access")


def _official(i: dict[str, Any]) -> str | None:
    user = access.finalising_official(i["db"], i["position_id"], i["today"])
    return user["id"] if user else None


RUN: dict[str, Callable[[dict[str, Any]], Any]] = {
    "holdingsOf": lambda i: access.holdings_of(i["db"], i["user_id"], i["today"]),
    "effectiveRoleIds": lambda i: access.effective_role_ids(i["db"], i["user_id"], i["today"]),
    "permissionScopes": lambda i: sorted(
        [code, scope]
        for code, scope in access.permission_scopes(i["db"], i["user_id"], i["today"]).items()
    ),
    "hasPermission": lambda i: access.has_permission(i["db"], i["user_id"], i["code"], i["today"]),
    "lini1PositionsInScope": lambda i: access.lini1_positions_in_scope(
        i["db"], i["user_id"], i["today"], i["code"], i["fiscal_year"]
    ),
    "canReadPosition": lambda i: access.can_read_position(
        i["db"], i["user_id"], i["lini1_position_id"], i["today"], i["fiscal_year"]
    ),
    "participationHolding": lambda i: access.participation_holding(
        i["db"], i["user_id"], i["lini1_position_id"], i["quarter_id"], i["today"]
    ),
    "checkAction": lambda i: access.check_action(
        i["db"], i["permissions"], i["user_id"], i["code"], i["acting_position_id"], i["today"]
    ),
    "finalisingOfficial": _official,
    "positionLine": lambda i: access.position_line(i["db"], i["position_id"]),
    "assignedLini2": lambda i: access.assigned_lini2(
        i["db"], i["lini1_position_id"], i["quarter_id"]
    ),
}

CASES = [(rule, case) for rule, cases in VECTORS.items() for case in cases]


@pytest.mark.parametrize(("rule", "case"), CASES, ids=[f"{r}: {c['name']}" for r, c in CASES])
def test_access_vector(rule: str, case: dict[str, Any]) -> None:
    assert RUN[rule](case["input"]) == case["expected"]
