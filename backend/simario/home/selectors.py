"""Home cards and position lists — PRD ch. 4 (FR-BRD-001 … 011). Ports buildHome and
buildPositionList in frontend/src/data/api/home.ts. Composition follows the active holding's
line; every count respects VIS-9 the same way the prototype does."""

import datetime as dt
from typing import Any

from simario.accounts.models import User
from simario.assessments.selectors import Db, assessment_db
from simario.board.models import ThreadSubscription
from simario.board.selectors import now_iso
from simario.board.serializers import SubscriptionRow, rows
from simario.core.format import format_date
from simario.domain import access, sheets
from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.domain import visibility as vis
from simario.domain.calendar import lateness_at
from simario.domain.index import by
from simario.reference.models import RiskProposal

Row = dict[str, Any]
ROMAN = ("I", "II", "III", "IV")


def _find(items: list[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def _q_order(q: Row) -> int:
    return int(q["fiscal_year"]) * 10 + int(q["number"])


def _days_between(a: str, b: str) -> int:
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def home_db() -> Db:
    db = assessment_db()
    db["subscriptions"] = rows(SubscriptionRow, ThreadSubscription.objects.all())
    return db


def _lini1_positions(db: Db) -> list[Row]:
    types = {t["id"] for t in db["position_types"] if t["line"] == 1}
    return [p for p in db["positions"] if p["active"] and p["position_type_id"] in types]


def _obligation(db: Db, q: Row, deadline: str, done: int, total: int, href: str, today: str) -> Row:
    fy = _find(db["fiscal_years"], "year", q["fiscal_year"])
    tolerance = fy["tolerance_days"] if fy else 7
    return {
        "quarter": q,
        "deadline": deadline,
        "days_left": _days_between(today, deadline),
        "lateness": lateness_at(f"{today}T00:00", deadline, tolerance),
        "done": done,
        "total": total,
        "href": href,
    }


def _register_state(db: Db, position_id: str, year: int) -> str:
    r = next(
        (
            x
            for x in db["registers"]
            if x["position_id"] == position_id and x["fiscal_year"] == year
        ),
        None,
    )
    if r is None:
        return "belum"
    fy = _find(db["fiscal_years"], "year", year)
    if r["status"] == "archived" or (fy and fy["status"] == "archived"):
        return "diarsipkan"
    if r["status"] == "published" or r.get("published_at"):
        return "terbit"
    return "siap" if r["status"] == "ready" else "draf"


def _quiet_count(db: Db, position_id: str, today: str) -> int:
    q = board_rules.posting_quarter(db, int(today[:4]), today)
    if q is None:
        return 0
    return len(
        [
            1
            for risk, _ in rules.quarter_risks(db, position_id, q)
            if board_rules.is_quiet(db, risk, q)
        ]
    )


def _last_activity_of(db: Db, position_id: str, year: int) -> str | None:
    reg = next(
        (
            x
            for x in db["registers"]
            if x["position_id"] == position_id and x["fiscal_year"] == year
        ),
        None,
    )
    if reg is None:
        return None
    times = [
        t
        for r in db["risks"]
        if r["register_id"] == reg["id"]
        for t in [board_rules.last_activity(db, r["id"])]
        if t
    ]
    return max(times) if times else None


def _l1_of(db: Db, rq_id: str) -> Row | None:
    return next(
        (
            a
            for a in by(db, "assessments", "risk_quarter_id").get((rq_id,), [])
            if a["risk_quarter_id"] == rq_id and a["assessor_line"] == 1
        ),
        None,
    )


def _lini1_card(
    db: Db, holding: Any, viewer: Row, quarters: list[Row], at: str, today: str, year: int
) -> Row:
    pid = holding["position_id"]
    base = f"/jabatan/{pid}"
    # FR-BRD-001: open obligations from any fiscal year.
    obligations = []
    for q in quarters:
        if today < q["lini1_opens_on"]:
            continue
        items = rules.quarter_risks(db, pid, q)
        owed = [
            rq
            for _, rq in items
            if ((_l1_of(db, rq["id"]) or {}).get("status") not in ("final", "not_assessed"))
            and not board_rules.opened_results(db, rq["id"], at)
        ]
        if not owed:
            continue
        done = len([1 for _, rq in items if (_l1_of(db, rq["id"]) or {}).get("status") == "final"])
        obligations.append(
            _obligation(
                db,
                q,
                q["lini1_deadline"],
                done,
                len(items),
                f"{base}/penilaian/{q['fiscal_year']}/{q['number']}",
                today,
            )
        )
    obligations.sort(key=lambda o: o["deadline"])
    upcoming = next(
        (q for q in quarters if q["lini1_opens_on"] > today and q["fiscal_year"] >= year), None
    )
    # FR-BRD-002: actions.
    actions: list[Row] = []
    pending = [
        (r, q)
        for q in quarters
        for _, rq in rules.quarter_risks(db, pid, q)
        for r in board_rules.opened_results(db, rq["id"], at)
        if r["explanation_required"] and r["explanation_status"] not in ("sent", "not_sent")
    ]
    if pending:
        r, q = sorted(pending, key=lambda x: x[0]["explanation_due_on"] or "")[0]
        due = (
            format_date(dt.date.fromisoformat(r["explanation_due_on"]))
            if r["explanation_due_on"]
            else "—"
        )
        actions.append(
            {
                "text": f"{len(pending)} hasil Tidak Sesuai menunggu penjelasan · tenggat "
                f"terdekat {due}",
                "href": f"{base}/penilaian/{q['fiscal_year']}/{q['number']}",
                "urgent": True,
            }
        )
    quiet = _quiet_count(db, pid, today)
    if quiet:
        actions.append(
            {
                "text": f"{quiet} risiko belum ada langkah triwulan ini",
                "href": f"{base}/papan/{year}",
            }
        )
    if holding["capacity"] == "pejabat":
        reg = next(
            (x for x in db["registers"] if x["position_id"] == pid and x["fiscal_year"] == year),
            None,
        )
        ready_items = 0
        if reg:
            risk_ids = {r["id"] for r in db["risks"] if r["register_id"] == reg["id"]}
            ready_items = len(
                [r for r in db["risks"] if r["register_id"] == reg["id"] and r["status"] == "ready"]
            ) + len(
                [
                    m
                    for m in db["mitigations"]
                    if m["status"] == "ready" and m["register_risk_id"] in risk_ids
                ]
            )
        if reg and (reg["status"] == "ready" or ready_items > 0):
            what = "Register" if reg["status"] == "ready" else f"{ready_items} tambahan register"
            actions.append(
                {"text": f"{what} siap dari operator", "href": f"{base}/register/{year}"}
            )
        for q in quarters:
            ready = len(
                [
                    1
                    for _, rq in rules.quarter_risks(db, pid, q)
                    if (_l1_of(db, rq["id"]) or {}).get("status") == "ready"
                ]
            )
            if ready:
                actions.append(
                    {
                        "text": f"{ready} draf penilaian TW {ROMAN[q['number'] - 1]} "
                        f"{q['fiscal_year']} siap dari operator",
                        "href": f"{base}/penilaian/{q['fiscal_year']}/{q['number']}",
                    }
                )
    # FR-BRD-003: register status.
    state = _register_state(db, pid, year)
    prev = next(
        (x for x in db["registers"] if x["position_id"] == pid and x["fiscal_year"] == year - 1),
        None,
    )
    cur = next(
        (x for x in db["registers"] if x["position_id"] == pid and x["fiscal_year"] == year), None
    )
    register = None
    if state in ("belum", "draf", "siap"):
        register = {
            "fiscal_year": year,
            "status": state,
            "can_copy": bool(prev)
            and (cur is None or not any(r["register_id"] == cur["id"] for r in db["risks"])),
            "href": f"{base}/register/{year}",
        }
    # FR-BRD-004: last quarter result.
    lq = sheets.latest_opened_quarter(db, pid, at)
    return {
        "obligations": obligations,
        "upcoming": {"quarter": upcoming, "opens_on": upcoming["lini1_opens_on"]}
        if upcoming
        else None,
        "actions": actions,
        "register": register,
        "last_quarter": {
            "mutu": sheets.lembar_mutu(db, viewer, pid, lq, at),
            "href": f"{base}/lembar/{lq['fiscal_year']}/{lq['number']}",
        }
        if lq
        else None,
    }


def _lini2_card(db: Db, uid: str, today: str, year: int) -> Row:
    q = board_rules.posting_quarter(db, year, today)
    out = []
    for pid in access.lini1_positions_in_scope(db, uid, today, 1, year):
        p = _find(db["positions"], "id", pid)
        assert p is not None
        unit = _find(db["org_units"], "id", p["org_unit_id"])
        out.append(
            {
                "position_id": pid,
                "name": p["name"],
                "unit": unit["name"] if unit else "",
                "assessed": len(rules.quarter_risks(db, pid, q)) if q else 0,
                "quiet": _quiet_count(db, pid, today),
                "last_activity": _last_activity_of(db, pid, year),
                "href": f"/jabatan/{pid}/papan/{year}",
            }
        )
    out.sort(key=lambda r: (-r["quiet"], r["name"]))
    return {"quarter": q, "rows": out}


def _lini3_card(db: Db, holding: Any, quarters: list[Row], at: str, today: str) -> Row:
    d = holding["position_id"]
    all_ = _lini1_positions(db)

    def mine(rq_id: str) -> Row | None:
        return next(
            (
                a
                for a in by(db, "assessments", "risk_quarter_id").get((rq_id,), [])
                if a["risk_quarter_id"] == rq_id and a["assessor_position_id"] == d
            ),
            None,
        )

    obligations = []
    for q in quarters:
        if today < q["lini3_opens_on"] or not any(
            a["quarter_id"] == q["id"] and a["position_id"] == d and not a["excluded"]
            for a in db["quarter_assessors"]
        ):
            continue
        items = [rq for p in all_ for _, rq in rules.quarter_risks(db, p["id"], q)]
        owed = [
            rq
            for rq in items
            if (mine(rq["id"]) or {}).get("status") != "final"
            and not rules.assessment_frozen(
                db,
                {"risk_quarter_id": rq["id"], "assessor_line": 3, "assessor_position_id": d},
                at,
            )
        ]
        if not owed:
            continue
        done = len([rq for rq in items if (mine(rq["id"]) or {}).get("status") == "final"])
        obligations.append(
            _obligation(
                db, q, q["lini3_deadline"], done, len(items), f"/penilaian?tw={q['id']}", today
            )
        )
    obligations.sort(key=lambda o: o["deadline"])
    latest = next(
        (
            q
            for q in reversed(quarters)
            if any(
                rules.result_opened(db, rq["id"], d, at)
                for p in all_
                for _, rq in rules.quarter_risks(db, p["id"], q)
            )
        ),
        None,
    )
    attention = None
    if latest:
        # VIS-9: only risks whose result for this directorate has opened.
        own = [
            rq
            for p in all_
            for _, rq in rules.quarter_risks(db, p["id"], latest)
            if rules.result_opened(db, rq["id"], d, at)
        ]
        attention = {
            "quarter": latest,
            "tidak_sesuai": len(
                [
                    rq
                    for rq in own
                    if any(
                        r["result"] == "tidak_sesuai"
                        for r in board_rules.opened_results(db, rq["id"], at)
                    )
                ]
            ),
            "berulang": len([rq for rq in own if rq["recurring"]]),
            "not_assessed": len(
                [rq for rq in own if (_l1_of(db, rq["id"]) or {}).get("status") == "not_assessed"]
            ),
        }
    p = _find(db["positions"], "id", d)
    return {
        "directorate": p["name"] if p else "",
        "obligations": obligations,
        "attention": attention,
    }


def _health(db: Db, today: str, year: int) -> list[Row]:
    """FR-BRD-008: configuration health for Superadmin (user and role management)."""
    q = board_rules.posting_quarter(db, year, today)
    no_pejabat = [
        p for p in db["positions"] if p["active"] and not access.officials_of(db, p["id"], today)
    ]
    lini1 = _lini1_positions(db)
    no_assignment = []
    if q:
        for p in lini1:
            covered = False
            for a in db["assignments"]:
                if a["target_position_id"] != p["id"]:
                    continue
                f = _find(db["quarters"], "id", a["quarter_from_id"])
                t = _find(db["quarters"], "id", a["quarter_to_id"])
                if f and t and _q_order(f) <= _q_order(q) <= _q_order(t):
                    covered = True
            if not covered:
                no_assignment.append(p)
    unpublished = [
        p for p in lini1 if _register_state(db, p["id"], year) not in ("terbit", "diarsipkan")
    ]
    no_deadlines = [
        x
        for x in db["quarters"]
        if x["fiscal_year"] == year and (not x["lini1_deadline"] or not x["lini3_deadline"])
    ]
    return [
        {
            "label": "Jabatan tanpa Pejabat",
            "count": len(no_pejabat),
            "href": "/pengaturan/pengguna",
            "items": [p["name"] for p in no_pejabat],
        },
        {
            "label": "Jabatan Lini 1 tanpa penugasan pemantauan triwulan ini",
            "count": len(no_assignment),
            "href": "/pengaturan/penugasan-pemantauan",
            "items": [p["name"] for p in no_assignment],
        },
        {
            "label": f"Register TA {year} belum terbit",
            "count": len(unpublished),
            "href": "/jabatan",
            "items": [p["name"] for p in unpublished],
        },
        {
            "label": f"Triwulan TA {year} tanpa tenggat",
            "count": len(no_deadlines),
            "href": "/pengaturan/tahun-anggaran",
            "items": [f"TW {x['number']}" for x in no_deadlines],
        },
    ]


def _activity(db: Db, uid: str, at: str, today: str) -> list[Row]:
    """FR-BRD-009: recent activity on followed threads (holders only — others cannot follow)."""
    risks = {r["id"]: r for r in db["risks"]}
    registers = {r["id"]: r for r in db["registers"]}
    picked = []
    for c in sorted(db["comments"], key=lambda c: c["created_at"], reverse=True):
        if c["author_user_id"] == uid or c["withdrawn_at"] or c["created_at"] > at:
            continue
        risk = risks.get(c["register_risk_id"])
        reg = registers.get(risk["register_id"]) if risk else None
        if not reg or not board_rules.is_following(
            db, uid, c["register_risk_id"], reg["position_id"], today
        ):
            continue
        assert risk is not None
        author = _find(db["users"], "id", c["author_user_id"])
        acting = _find(db["positions"], "id", c["acting_position_id"])
        picked.append(
            {
                "id": c["id"],
                "line": c["author_line"],
                "author": author["full_name"] if author else "",
                "position": acting["name"] if acting else "",
                "risk": risk["description_snapshot"],
                "at": c["created_at"],
                "href": f"/jabatan/{reg['position_id']}/papan/{reg['fiscal_year']}/risiko/"
                f"{risk['id']}#komentar-{c['id']}",
            }
        )
        if len(picked) == 10:
            break
    return picked


def build_home(user: User, active_position_id: str | None) -> Row:
    at = now_iso()
    today = at[:10]
    year = int(today[:4])
    uid = str(user.id)
    db = home_db()
    holdings = access.holdings_of(db, uid, today)
    holding = next((h for h in holdings if h["position_id"] == active_position_id), None) or (
        holdings[0] if holdings else None
    )
    viewer = vis.viewer_for(db, uid, today)
    open_years = {f["year"] for f in db["fiscal_years"] if f["status"] != "archived"}
    quarters = sorted((q for q in db["quarters"] if q["fiscal_year"] in open_years), key=_q_order)
    view: Row = {
        "line": holding["line"] if holding else None,
        "position_id": holding["position_id"] if holding else None,
        "is_pejabat": bool(holding and holding["capacity"] == "pejabat"),
        "activity": None,
    }
    if holding and holding["line"] == 1:
        view["lini1"] = _lini1_card(db, holding, viewer, quarters, at, today, year)
    if holding and holding["line"] == 2:
        view["lini2"] = _lini2_card(db, uid, today, year)
    if holding and holding["line"] == 3:
        view["lini3"] = _lini3_card(db, holding, quarters, at, today)
    if access.has_permission(db, uid, 21, today) and access.has_permission(db, uid, 22, today):
        view["health"] = _health(db, today, year)
    if not holding and "health" not in view and access.has_permission(db, uid, 12, today):
        view["pmd"] = {"proposals": RiskProposal.objects.filter(status="pending").count()}
    if holding:
        view["activity"] = _activity(db, uid, at, today)
    return view


def build_position_list(user: User) -> list[Row]:
    """FR-BRD-011: `/jabatan` (scope Unit/All) and `/pantauan` (Lini 2 own scope)."""
    at = now_iso()
    today = at[:10]
    year = int(today[:4])
    db = home_db()
    out = []
    for pid in access.lini1_positions_in_scope(db, str(user.id), today, 1, year):
        p = _find(db["positions"], "id", pid)
        if p is None or not p["active"]:
            continue
        unit = _find(db["org_units"], "id", p["org_unit_id"])
        ptype = _find(db["position_types"], "id", p["position_type_id"])
        out.append(
            {
                "position_id": pid,
                "name": p["name"],
                "unit": unit["name"] if unit else "",
                "unit_id": p["org_unit_id"],
                "type": ptype["name"] if ptype else "",
                "type_id": p["position_type_id"],
                "register": _register_state(db, pid, year),
                "quiet": _quiet_count(db, pid, today),
                "last_activity": _last_activity_of(db, pid, year),
                "href": f"/jabatan/{pid}/papan/{year}",
            }
        )
    out.sort(key=lambda r: (-r["quiet"], r["name"]))
    return out
