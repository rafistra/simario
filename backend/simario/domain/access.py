"""Access rules (PRD §1.4, §1.5, FR-ADM-002, RB-ADM-001): permission (capability) →
holding / assignment / line rule (object) → Pejabat (finalising). Role names are never
consulted (RB-ADM-002).

Pure functions over `Db`: collections named in snake_case (`position_types`, ...) holding rows
with snake_case keys, string ids and `YYYY-MM-DD` dates — the prototype DB after key
conversion, or rows built from the ORM. Mirrors frontend/src/domain/rules/access.ts; shared
vectors in shared/test-vectors/access.json."""

from collections.abc import Mapping, Sequence
from typing import Any, Literal, TypedDict

Row = dict[str, Any]
Db = Mapping[str, Sequence[Row]]

DenyReason = Literal["permission", "holding", "official", "filler"]

SCOPE_RANK = {"sendiri": 0, "unit": 1, "semua": 2}


class Holding(TypedDict):
    kind: Literal["occupancy", "delegate"]
    id: str
    position_id: str
    capacity: Literal["pejabat", "operator"]
    line: int
    # Occupancy: is the Pengisi (always true for single-Pejabat positions).
    is_filler: bool


def _find(rows: Sequence[Row], key: str, value: Any) -> Row | None:
    return next((r for r in rows if r[key] == value), None)


def _active_on(start: str, end: str | None, today: str) -> bool:
    return start <= today and (end is None or end >= today)


def position_line(db: Db, position_id: str) -> int:
    pos = _find(db["positions"], "id", position_id)
    ptype = _find(db["position_types"], "id", pos["position_type_id"]) if pos else None
    return int(ptype["line"]) if ptype else 1


def holdings_of(db: Db, user_id: str, today: str) -> list[Holding]:
    """Active holdings on `today`, by line. INV-11: a delegation needs its appointer active and
    Pengisi."""
    user = _find(db["users"], "id", user_id)
    if not user or not user["active"]:
        return []
    occ: list[Holding] = [
        {
            "kind": "occupancy",
            "id": o["id"],
            "position_id": o["position_id"],
            "capacity": "pejabat",
            "line": position_line(db, o["position_id"]),
            "is_filler": o["is_filler"],
        }
        for o in db["occupancies"]
        if o["user_id"] == user_id and _active_on(o["start_date"], o["end_date"], today)
    ]
    dels: list[Holding] = []
    for d in db["delegates"]:
        if d["user_id"] != user_id or not _active_on(d["start_date"], d["end_date"], today):
            continue
        appointer = _find(db["occupancies"], "id", d["appointed_by_occupancy_id"])
        if not (
            appointer
            and appointer["is_filler"]
            and _active_on(appointer["start_date"], appointer["end_date"], today)
        ):
            continue
        dels.append(
            {
                "kind": "delegate",
                "id": d["id"],
                "position_id": d["position_id"],
                "capacity": "operator",
                "line": position_line(db, d["position_id"]),
                "is_filler": False,
            }
        )
    return sorted([*occ, *dels], key=lambda h: h["line"])


def effective_role_ids(db: Db, user_id: str, today: str) -> list[str]:
    """Manual roles + the default role of every held position type (§1.4.3)."""
    manual = [r["role_id"] for r in db["user_roles"] if r["user_id"] == user_id]
    from_holdings = []
    for h in holdings_of(db, user_id, today):
        pos = _find(db["positions"], "id", h["position_id"])
        ptype = _find(db["position_types"], "id", pos["position_type_id"]) if pos else None
        if ptype:
            from_holdings.append(ptype["default_role_id"])
    return list(dict.fromkeys([*manual, *from_holdings]))


def permission_scopes(db: Db, user_id: str, today: str) -> dict[int, str | None]:
    """Union of all roles' permissions; the widest scope wins."""
    roles = effective_role_ids(db, user_id, today)
    out: dict[int, str | None] = {}
    for rp in db["role_permissions"]:
        if rp["role_id"] not in roles:
            continue
        code, scope = rp["permission"], rp["scope"]
        if code not in out:
            out[code] = scope
            continue
        prev = out[code]
        if scope and (not prev or SCOPE_RANK[scope] > SCOPE_RANK[prev]):
            out[code] = scope
    return out


def has_permission(db: Db, user_id: str, code: int, today: str) -> bool:
    return code in permission_scopes(db, user_id, today)


def _quarter_key(q: Row) -> int:
    return int(q["fiscal_year"]) * 10 + int(q["number"])


def _assignment_positions(a: Row) -> list[str]:
    return [a["lead_position_id"], *(s["position_id"] for s in a["supports"])]


def assigned_lini2(db: Db, lini1_position_id: str, quarter_id: str) -> list[str]:
    """Lini 2 positions assigned to a Lini 1 position for a quarter (lead + supports)."""
    q = _find(db["quarters"], "id", quarter_id)
    if not q:
        return []
    key = _quarter_key(q)
    out: list[str] = []
    for a in db["assignments"]:
        if a["target_position_id"] != lini1_position_id:
            continue
        start = _find(db["quarters"], "id", a["quarter_from_id"])
        end = _find(db["quarters"], "id", a["quarter_to_id"])
        if start and end and _quarter_key(start) <= key <= _quarter_key(end):
            out.extend(_assignment_positions(a))
    return out


def _monitored_positions(
    db: Db, lini2_position_ids: list[str], fiscal_year: int | None
) -> list[str]:
    out: list[str] = []
    for a in db["assignments"]:
        if not any(p in lini2_position_ids for p in _assignment_positions(a)):
            continue
        if fiscal_year is not None:
            start = _find(db["quarters"], "id", a["quarter_from_id"])
            end = _find(db["quarters"], "id", a["quarter_to_id"])
            if not (start and end and start["fiscal_year"] <= fiscal_year <= end["fiscal_year"]):
                continue
        out.append(a["target_position_id"])
    return out


def _is_lini1(db: Db, position: Row) -> bool:
    ptype = _find(db["position_types"], "id", position["position_type_id"])
    return bool(ptype and ptype["line"] == 1)


def lini1_positions_in_scope(
    db: Db, user_id: str, today: str, code: int = 1, fiscal_year: int | None = None
) -> list[str]:
    """Lini 1 positions visible under a scoped permission (default 1) — §1.5. Lini 2 "Own"
    covers positions assigned in any quarter of the viewed fiscal year."""
    scopes = permission_scopes(db, user_id, today)
    if code not in scopes:
        return []
    scope = scopes[code]
    lini1 = [p for p in db["positions"] if _is_lini1(db, p)]
    if scope == "semua":
        return [p["id"] for p in lini1]
    holdings = holdings_of(db, user_id, today)
    if scope == "unit":
        units = set()
        for h in holdings:
            pos = _find(db["positions"], "id", h["position_id"])
            if pos:
                units.add(pos["org_unit_id"])
        user = _find(db["users"], "id", user_id)
        if user and user.get("org_unit_id"):
            units.add(user["org_unit_id"])
        return [p["id"] for p in lini1 if p["org_unit_id"] in units]
    own = [h["position_id"] for h in holdings if h["line"] == 1]
    monitored = _monitored_positions(
        db, [h["position_id"] for h in holdings if h["line"] == 2], fiscal_year
    )
    return list(dict.fromkeys([*own, *monitored]))


def can_view_position(
    db: Db, user_id: str, lini1_position_id: str, today: str, fiscal_year: int | None = None
) -> bool:
    return lini1_position_id in lini1_positions_in_scope(db, user_id, today, 1, fiscal_year)


def can_read_position(
    db: Db, user_id: str, lini1_position_id: str, today: str, fiscal_year: int | None = None
) -> bool:
    """Read access to a Lini 1 workspace (§1.5): any holding on the position, or a permission-1
    scope covering it for the viewed fiscal year."""
    return any(
        h["position_id"] == lini1_position_id for h in holdings_of(db, user_id, today)
    ) or can_view_position(db, user_id, lini1_position_id, today, fiscal_year)


def participation_holding(
    db: Db, user_id: str, lini1_position_id: str, quarter_id: str, today: str
) -> Holding | None:
    """The holding through which a user takes part in a Lini 1 position's threads (§1.5,
    permission 6): its holders, the Lini 2 assigned for the quarter, any Lini 3. None for
    readers."""
    if not has_permission(db, user_id, 6, today):
        return None
    holdings = holdings_of(db, user_id, today)
    own = next((h for h in holdings if h["position_id"] == lini1_position_id), None)
    if own:
        return own
    lini2 = assigned_lini2(db, lini1_position_id, quarter_id)
    monitor = next((h for h in holdings if h["line"] == 2 and h["position_id"] in lini2), None)
    if monitor:
        return monitor
    return next((h for h in holdings if h["line"] == 3), None)


def check_action(
    db: Db,
    permissions: Sequence[Row],
    user_id: str,
    code: int,
    acting_position_id: str,
    today: str,
) -> dict[str, Any]:
    """Content actions (INV-25) from the acting position: the permission, a holding on that
    position, Pejabat/Pengisi for requires_official (INV-12), and Pengisi or Operator for
    drafting on multi-Pejabat positions (INV-24). Returns {ok, holding} or {ok, reason}."""
    definition = _find(permissions, "code", code)
    if not definition:
        raise ValueError(f"Unknown permission {code}")
    if not has_permission(db, user_id, code, today):
        return {"ok": False, "reason": "permission"}
    holding = next(
        (h for h in holdings_of(db, user_id, today) if h["position_id"] == acting_position_id),
        None,
    )
    if not holding:
        return {"ok": False, "reason": "holding"}
    if definition["requires_official"] and not (
        holding["capacity"] == "pejabat" and holding["is_filler"]
    ):
        reason = "official" if holding["capacity"] == "operator" else "filler"
        return {"ok": False, "reason": reason}
    if definition["is_drafting"] and holding["capacity"] == "pejabat" and not holding["is_filler"]:
        pos = _find(db["positions"], "id", acting_position_id)
        ptype = _find(db["position_types"], "id", pos["position_type_id"]) if pos else None
        if ptype and ptype["allows_multiple_officials"]:
            return {"ok": False, "reason": "filler"}
    return {"ok": True, "holding": holding}


def finalising_official(db: Db, position_id: str, today: str) -> Row | None:
    """The Pejabat (Pokja: Pengisi) who performs finalising actions — for "Dilakukan oleh
    [Nama Pejabat]"."""
    occ = next(
        (
            o
            for o in db["occupancies"]
            if o["position_id"] == position_id
            and o["is_filler"]
            and _active_on(o["start_date"], o["end_date"], today)
        ),
        None,
    )
    return _find(db["users"], "id", occ["user_id"]) if occ else None


def officials_of(db: Db, position_id: str, today: str) -> list[dict[str, Row]]:
    """Current Pejabat holders (all Pokja members) of a position."""
    out = []
    for o in db["occupancies"]:
        if o["position_id"] == position_id and _active_on(o["start_date"], o["end_date"], today):
            user = _find(db["users"], "id", o["user_id"])
            if user:
                out.append({"occupancy": o, "user": user})
    return out
