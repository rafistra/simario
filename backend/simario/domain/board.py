"""Board and thread rules (PRD §6, RB-PPN-004, §1.5 participation, VIS-1/2/3/9). Mirrors
frontend/src/domain/rules/board.ts; shared vectors in shared/test-vectors/board.json. Rows are
plain dicts with snake_case keys; datetimes are local (WITA) ISO strings compared as text."""

import datetime as dt
from typing import Any

from .access import Db, holdings_of, participation_holding
from .index import by
from .register import assessed_in_quarter
from .visibility import is_late_directorate

Row = dict[str, Any]

EDIT_WINDOW_MINUTES = 15
MAX_COMMENT_LENGTH = 5000
MAX_FILES = 10
MAX_FILE_BYTES = 20 * 1024 * 1024
QUOTA_BYTES = 1024 * 1024 * 1024
ALLOWED_EXTENSIONS = ("pdf", "docx", "xlsx", "png", "jpg", "jpeg", "mp4")


def _key(q: Row) -> int:
    return int(q["fiscal_year"]) * 10 + int(q["number"])


def posting_quarter(db: Db, fiscal_year: int, today: str) -> Row | None:
    """The quarter a comment posted now belongs to: the quarter of the thread's fiscal year
    containing today; after year-end, TW IV. None before the fiscal year starts."""
    qs = sorted(
        (q for q in db["quarters"] if q["fiscal_year"] == fiscal_year), key=lambda q: q["number"]
    )
    if not qs or today < qs[0]["starts_on"]:
        return None
    return next((q for q in qs if q["starts_on"] <= today <= q["ends_on"]), qs[-1])


def opened_results(db: Db, risk_quarter_id: str, at: str) -> list[Row]:
    """Results whose opening moment has passed."""
    return [
        r
        for r in by(db, "results", "risk_quarter_id").get((risk_quarter_id,), [])
        if r["opened_at"][:16] <= at[:16]
    ]


def expected_lini3(db: Db, quarter_id: str) -> list[str]:
    """Lini 3 positions expected to assess a quarter (not excluded)."""
    return [
        a["position_id"]
        for a in db["quarter_assessors"]
        if a["quarter_id"] == quarter_id and not a["excluded"]
    ]


def _risk_quarter(db: Db, risk_id: str, quarter_id: str) -> Row | None:
    return next(
        (
            x
            for x in db["risk_quarters"]
            if x["register_risk_id"] == risk_id and x["quarter_id"] == quarter_id
        ),
        None,
    )


def related_quarters(db: Db, risk: Row, posting: Row, at: str) -> list[Row]:
    """RB-PPN-004: earlier quarters of the year with a comparison not yet fully open or a
    pending explanation for this risk ("Terkait TW [n]")."""
    out = []
    for q in db["quarters"]:
        if q["fiscal_year"] != posting["fiscal_year"] or q["number"] >= posting["number"]:
            continue
        rq = _risk_quarter(db, risk["id"], q["id"])
        if rq is None:
            continue
        opened = opened_results(db, rq["id"], at)
        if not opened:
            continue
        partial = len(opened) < len(expected_lini3(db, q["id"]))
        pending = any(r["explanation_status"] in ("pending", "ready") for r in opened)
        if partial or pending:
            out.append(q)
    return sorted(out, key=lambda q: q["number"])


def _live_step(c: Row) -> bool:
    return bool(c["is_step"]) and c["author_line"] == 1 and not c.get("withdrawn_at")


def has_langkah(db: Db, risk_id: str, quarter_id: str) -> bool:
    return any(
        c["quarter_id"] == quarter_id and _live_step(c)
        for c in by(db, "comments", "register_risk_id").get((risk_id,), [])
    )


def is_quiet(db: Db, risk: Row, quarter: Row | None) -> bool:
    """FR-PPN-009: "Belum ada langkah triwulan ini"."""
    if quarter is None:
        return False
    return assessed_in_quarter(db, risk, quarter) and not has_langkah(db, risk["id"], quarter["id"])


def latest_opened(db: Db, viewer: Row, risk: Row, at: str) -> Row | None:
    """The latest quarter of the risk with an opened result, as the viewer may see it."""
    quarters = {q["id"]: q for q in db["quarters"]}
    candidates = sorted(
        (
            (rq, quarters[rq["quarter_id"]])
            for rq in db["risk_quarters"]
            if rq["register_risk_id"] == risk["id"] and opened_results(db, rq["id"], at)
        ),
        key=lambda x: _key(x[1]),
        reverse=True,
    )
    if not candidates:
        return None
    rq, q = candidates[0]
    opened = opened_results(db, rq["id"], at)
    opened_set = {r["lini3_position_id"] for r in opened}
    hidden = is_late_directorate(viewer, opened_set, expected_lini3(db, q["id"]))
    lini1 = next(
        (
            a
            for a in db["assessments"]
            if a["risk_quarter_id"] == rq["id"] and a["assessor_line"] == 1
        ),
        None,
    )
    chips: list[Row] = []
    if not hidden:
        chips.append(
            {
                "position_id": lini1["assessor_position_id"] if lini1 else "",
                "label": "L1",
                "line": 1,
                "predicate": lini1["predicate"]
                if lini1 and lini1["status"] == "final" and not lini1["not_relevant"]
                else None,
            }
        )
        positions = {p["id"]: p for p in db["positions"]}
        for r in opened:
            a = next(
                (
                    x
                    for x in db["assessments"]
                    if x["risk_quarter_id"] == rq["id"]
                    and x["assessor_position_id"] == r["lini3_position_id"]
                ),
                None,
            )
            p = positions.get(r["lini3_position_id"]) or {}
            chips.append(
                {
                    "position_id": r["lini3_position_id"],
                    "label": p.get("short_name") or p.get("code") or "",
                    "line": 3,
                    "predicate": a["predicate"] if a else None,
                    "result": r["result"],
                }
            )
    return {
        "quarter": q,
        "risk_quarter": rq,
        "hidden": hidden,
        "chips": chips,
        "tidak_sesuai": not hidden and any(r["result"] == "tidak_sesuai" for r in opened),
        "recurring": not hidden and bool(rq["recurring"]),
    }


def thread_participants(
    db: Db, lini1_position_id: str, quarter_id: str, today: str, except_user_id: str | None = None
) -> list[Row]:
    """Mention picker (FR-PPN-007): participants of the position's threads for the quarter."""
    positions = {p["id"]: p for p in db["positions"]}
    out = []
    for u in db["users"]:
        if not u["active"] or u["id"] == except_user_id:
            continue
        if not holdings_of(db, u["id"], today):
            continue
        holding = participation_holding(db, u["id"], lini1_position_id, quarter_id, today)
        if holding is None:
            continue
        out.append(
            {
                "user_id": u["id"],
                "name": u["full_name"],
                "holding": holding,
                "position_name": (positions.get(holding["position_id"]) or {}).get("name", ""),
            }
        )
    return sorted(out, key=lambda p: (p["holding"]["line"], p["name"]))


def _minutes(at: str) -> float:
    return dt.datetime.fromisoformat(at[:16]).timestamp() / 60


def can_edit_comment(comment: Row, user_id: str, at: str) -> bool:
    """INV-19: the author may edit within 15 minutes of posting."""
    if comment["author_user_id"] != user_id or comment.get("withdrawn_at"):
        return False
    return _minutes(at) - _minutes(comment["created_at"]) <= EDIT_WINDOW_MINUTES


def is_always_subscribed(db: Db, user_id: str, position_id: str, today: str) -> bool:
    """Holders of the position follow its threads and cannot mute them."""
    return any(h["position_id"] == position_id for h in holdings_of(db, user_id, today))


def is_following(db: Db, user_id: str, risk_id: str, position_id: str, today: str) -> bool:
    if is_always_subscribed(db, user_id, position_id, today):
        return True
    sub = next(
        (
            s
            for s in db["subscriptions"]
            if s["user_id"] == user_id and s["register_risk_id"] == risk_id
        ),
        None,
    )
    return bool(sub) and not sub["muted"]  # type: ignore[index]


def last_activity(db: Db, risk_id: str) -> str | None:
    times = [c["created_at"] for c in by(db, "comments", "register_risk_id").get((risk_id,), [])]
    return max(times) if times else None


def storage_used(db: Db, position_id: str, fiscal_year: int) -> int:
    """Attachment bytes of a position's threads and assessments in a fiscal year (NFR-012)."""
    reg = next(
        (
            r
            for r in db["registers"]
            if r["position_id"] == position_id and r["fiscal_year"] == fiscal_year
        ),
        None,
    )
    if reg is None:
        return 0
    risk_ids = {r["id"] for r in db["risks"] if r["register_id"] == reg["id"]}
    comment_ids = {c["id"] for c in db["comments"] if c["register_risk_id"] in risk_ids}
    rq_ids = {rq["id"] for rq in db["risk_quarters"] if rq["register_risk_id"] in risk_ids}
    assessment_ids = {a["id"] for a in db["assessments"] if a["risk_quarter_id"] in rq_ids}
    return sum(
        int(a["size_bytes"])
        for a in db["attachments"]
        if (
            a["owner_id"] in comment_ids
            if a["owner_kind"] == "comment"
            else a["owner_id"] in assessment_ids
        )
    )


def file_problem(name: str, size: int) -> str | None:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else name.lower()
    if ext not in ALLOWED_EXTENSIONS:
        fmt = f".{ext}" if ext else "berkas"
        return f"Format {fmt} tidak didukung. Gunakan PDF, DOCX, XLSX, PNG, JPG, atau MP4."
    if size > MAX_FILE_BYTES:
        return "Ukuran berkas melebihi 20 MB."
    return None
