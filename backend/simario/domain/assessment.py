"""Quarterly assessment rules (PRD §2.5, ch. 7 FR-NIL-*, RB-NIL-*, INV-16/18/23). Mirrors
frontend/src/domain/rules/assessment.ts; shared vectors in shared/test-vectors/assessment.json.
Rows are plain dicts with snake_case keys; datetimes are local (WITA) ISO strings compared on
their first 16 characters."""

from collections.abc import Sequence
from typing import Any

from .access import Db
from .board import expected_lini3, opened_results
from .calendar import add_days, lateness_at
from .comparison import compare_assessments, explanation_due_on
from .index import by
from .register import assessed_in_quarter
from .score_bands import predicate_for
from .score_options import _tenths, sort_options

Row = dict[str, Any]
ROMAN = ("I", "II", "III", "IV")


def _find(items: Sequence[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def window_open(q: Row, line: int, today: str) -> bool:
    """§2.5: the assessment window opens on `*_opens_on` and has no closing date of its own."""
    return today >= window_opens_on(q, line)


def window_opens_on(q: Row, line: int) -> str:
    return str(q["lini1_opens_on"] if line == 1 else q["lini3_opens_on"])


def band_version_for(db: Db, q: Row) -> str | None:
    """The band version of a quarter: fixed when its first window opened, else the active one."""
    if q.get("score_band_version_id"):
        return str(q["score_band_version_id"])
    active = _find(db["score_band_versions"], "status", "active")
    return str(active["id"]) if active else None


def predicate_in(db: Db, q: Row, score: float | None) -> str | None:
    if score is None:
        return None
    version = band_version_for(db, q)
    bands = [b for b in db["score_bands"] if b["version_id"] == version]
    return predicate_for(score, bands)  # type: ignore[arg-type]


def options_of(db: Db, version_id: str | None) -> list[Row]:
    """The statements of a band version in dropdown order (PRD v2.8)."""
    return sort_options([o for o in db["score_options"] if o["version_id"] == version_id])


def option_label_of(db: Db, version_id: str | None, score: float | None) -> str | None:
    if score is None:
        return None
    option = next(
        (o for o in options_of(db, version_id) if _tenths(o["value"]) == _tenths(score)), None
    )
    return str(option["label"]) if option else None


def quarter_risks(db: Db, position_id: str, q: Row) -> list[tuple[Row, Row]]:
    """The published risks of a position assessed in a quarter (RB-REG-006), with their
    RiskQuarter."""
    registers = by(db, "registers", "position_id", "fiscal_year").get(
        (position_id, q["fiscal_year"])
    )
    if not registers:
        return []
    rqs = by(db, "risk_quarters", "register_risk_id", "quarter_id")
    out = []
    for risk in by(db, "risks", "register_id").get((registers[0]["id"],), []):
        if not assessed_in_quarter(db, risk, q):
            continue
        found = rqs.get((risk["id"], q["id"]))
        if found:
            out.append((risk, found[0]))
    return out


def result_opened(db: Db, rq_id: str, lini3_position_id: str, at: str) -> bool:
    return any(r["lini3_position_id"] == lini3_position_id for r in opened_results(db, rq_id, at))


def assessment_frozen(db: Db, a: Row, at: str) -> bool:
    """INV-18: Lini 1 is frozen once any result of the risk opened; a Lini 3 position once its
    own result opened."""
    if a["assessor_line"] == 1:
        return len(opened_results(db, a["risk_quarter_id"], at)) > 0
    return result_opened(db, a["risk_quarter_id"], a["assessor_position_id"], at)


def comparison_status_at(db: Db, rq: Row, at: str) -> str:
    opened = opened_results(db, rq["id"], at)
    if not opened:
        return "waiting"
    ids = {r["lini3_position_id"] for r in opened}
    return "open" if all(p in ids for p in expected_lini3(db, rq["quarter_id"])) else "partial"


def _tolerance(db: Db, year: int) -> int:
    fy = _find(db["fiscal_years"], "year", year)
    return int(fy["tolerance_days"]) if fy else 7


def finalise_lateness(db: Db, q: Row, line: int, at: str) -> str | None:
    deadline = q["lini1_deadline"] if line == 1 else q["lini3_deadline"]
    return lateness_at(at, deadline, _tolerance(db, q["fiscal_year"]))


def explanation_lateness(db: Db, r: Row, at: str, year: int) -> str | None:
    """Lateness of an explanation fixed at send (FR-NIL-008)."""
    if not r.get("explanation_due_on"):
        return None
    return lateness_at(at, r["explanation_due_on"], _tolerance(db, year))


def pending_explanation_lateness(db: Db, r: Row, today: str, year: int) -> str | None:
    """Display state of a pending explanation: "belum dikirim" until due, then late."""
    due = r.get("explanation_due_on")
    if not due or today <= due:
        return None
    return "terlambat" if today <= add_days(due, _tolerance(db, year)) else "sangat_terlambat"


def lini3_overdue(q: Row, a: Row | None, today: str) -> bool:
    """Lini 3 position has not finalised and the Lini 3 deadline has passed."""
    return (a is None or a["status"] != "final") and today > str(q["lini3_deadline"])


def evaluate_opening(db: Db, rq: Row, at: str) -> Row | None:
    """§2.5 "When a comparison opens", for one risk-quarter at `at`. Pure: returns what changes
    — new results (without ids), the Lini 1 row closed as "Tidak dinilai Lini 1" (`lini1`:
    {"create": bool, "assessor_position_id", "score_band_version_id"} or None), the new
    comparison status and first opening — or None when nothing opens. Idempotent."""
    q = _find(db["quarters"], "id", rq["quarter_id"])
    assert q is not None
    fy = _find(db["fiscal_years"], "year", q["fiscal_year"])
    if fy and fy["status"] == "archived":
        return None
    today = at[:10]
    expected = expected_lini3(db, q["id"])
    existing = {r["lini3_position_id"] for r in db["results"] if r["risk_quarter_id"] == rq["id"]}
    assessments = [a for a in db["assessments"] if a["risk_quarter_id"] == rq["id"]]
    l1 = next((a for a in assessments if a["assessor_line"] == 1), None)
    finals = [
        a
        for p in expected
        for a in [next((x for x in assessments if x["assessor_position_id"] == p), None)]
        if a is not None and a["status"] == "final"
    ]
    all_final = (
        l1 is not None
        and l1["status"] == "final"
        and len(finals) == len(expected)
        and len(expected) > 0
    )
    deadline_passed = today > q["lini3_deadline"]
    if not all_final and not (deadline_passed and finals):
        return None
    to_open = [a for a in finals if a["assessor_position_id"] not in existing]
    if not to_open:
        return None

    lini1: Row | None = None
    # First opening closes an unfinalised Lini 1 as "Tidak dinilai Lini 1" (§2.5).
    if not existing and (l1 is None or l1["status"] != "final"):
        risk = _find(db["risks"], "id", rq["register_risk_id"])
        assert risk is not None
        register = _find(db["registers"], "id", risk["register_id"])
        assert register is not None
        lini1 = {
            "create": l1 is None,
            "assessor_position_id": register["position_id"],
            "score_band_version_id": band_version_for(db, q),
        }
        l1 = {
            **(l1 or {}),
            "status": "not_assessed",
            "score": None,
            "predicate": None,
            "not_relevant": bool(l1 and l1["not_relevant"]),
        }

    opened = []
    for a in to_open:
        outcome = compare_assessments(l1, a)
        opened.append(
            {
                "lini3_position_id": a["assessor_position_id"],
                "opened_at": at,
                **outcome,
                "explanation_due_on": explanation_due_on(at, q["explanation_workdays"])
                if outcome["result"] == "tidak_sesuai"
                else None,
            }
        )
    now_open = existing | {a["assessor_position_id"] for a in to_open}
    return {
        "opened": opened,
        "lini1": lini1,
        "comparison_status": "open" if all(p in now_open for p in expected) else "partial",
        "first_opened_at": rq.get("first_opened_at") or at,
    }


def previous_risk_quarter(db: Db, rq: Row) -> Row | None:
    """The RiskQuarter of the same lineage in the previous quarter (crossing fiscal years)."""
    q = _find(db["quarters"], "id", rq["quarter_id"])
    assert q is not None
    year, n = (q["fiscal_year"] - 1, 4) if q["number"] == 1 else (q["fiscal_year"], q["number"] - 1)
    prev_q = next(
        (x for x in db["quarters"] if x["fiscal_year"] == year and x["number"] == n), None
    )
    if prev_q is None:
        return None
    risk = _find(db["risks"], "id", rq["register_risk_id"])
    lineage = risk["lineage_id"] if risk else None
    risk_ids = {r["id"] for r in db["risks"] if r["lineage_id"] == lineage}
    return next(
        (
            x
            for x in db["risk_quarters"]
            if x["quarter_id"] == prev_q["id"] and x["register_risk_id"] in risk_ids
        ),
        None,
    )


def _kurang_opened(db: Db, rq_id: str) -> bool:
    for r in db["results"]:
        if r["risk_quarter_id"] != rq_id:
            continue
        a = next(
            (
                x
                for x in db["assessments"]
                if x["risk_quarter_id"] == rq_id
                and x["assessor_position_id"] == r["lini3_position_id"]
            ),
            None,
        )
        if a is not None and a["predicate"] == "kurang":
            return True
    return False


def is_recurring(db: Db, rq: Row) -> bool:
    """FR-NIL-011: Lini 3 Kurang Terkendali in this quarter and the previous one (any
    directorate, by lineage)."""
    prev = previous_risk_quarter(db, rq)
    return prev is not None and _kurang_opened(db, rq["id"]) and _kurang_opened(db, prev["id"])


def tw_label(q: Row) -> str:
    return f"TW {ROMAN[q['number'] - 1]}"
