"""Comparison opening, recurrence detection and their notifications (§2.5, FR-NIL-007/009/011,
FR-NTF-007/008/009). Ports frontend/src/data/local/comparisons.ts. Runs as the scheduled task
`comparisons` and right after every finalise. Idempotent: nothing happens when no result opens,
and it is safe when the clock jumps far ahead."""

import datetime as dt
from collections.abc import Iterable
from typing import Any

from django.db import transaction
from rest_framework import serializers

from simario.accounts.models import User
from simario.core.format import format_date
from simario.domain import access
from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.notifications.services import notify

from .models import Assessment, ComparisonResult, RiskQuarter
from .selectors import Db, assessment_db

Row = dict[str, Any]
_DT = serializers.DateTimeField()


def _iso(at: dt.datetime) -> str:
    return str(_DT.to_representation(at))


def _short(s: str) -> str:
    return f"{s[:79]}…" if len(s) > 80 else s


def _find(items: Iterable[Row], key: str, value: Any) -> Row | None:
    return next((x for x in items if x.get(key) == value), None)


def holders_of(db: Db, position_ids: Iterable[str], today: str) -> list[str]:
    """Active users holding any of the positions on `today`."""
    wanted = set(position_ids)
    return [
        u["id"]
        for u in db["users"]
        if u["active"]
        and any(h["position_id"] in wanted for h in access.holdings_of(db, u["id"], today))
    ]


def _send(user_ids: Iterable[str], **kw: Any) -> None:
    for uid in user_ids:
        notify(user=User.objects.get(pk=uid), **kw)


def _persist(db: Db, rq: Row, change: Row, at: dt.datetime) -> list[Row]:
    """Writes one opening (results, Lini 1 closure, RiskQuarter) and mirrors it into `db`."""
    lini1 = change["lini1"]
    if lini1 is not None:
        if lini1["create"]:
            a = Assessment.objects.create(
                risk_quarter_id=rq["id"],
                assessor_position_id=lini1["assessor_position_id"],
                assessor_line=1,
                status="not_assessed",
                score_band_version_id=lini1["score_band_version_id"],
                updated_at=at,
            )
            db["assessments"].append(
                {
                    "id": str(a.id),
                    "risk_quarter_id": rq["id"],
                    "assessor_position_id": lini1["assessor_position_id"],
                    "assessor_line": 1,
                    "status": "not_assessed",
                    "score": None,
                    "predicate": None,
                    "not_relevant": False,
                }
            )
        else:
            Assessment.objects.filter(risk_quarter_id=rq["id"], assessor_line=1).update(
                status="not_assessed", score=None, predicate=None, updated_at=at
            )
            for x in db["assessments"]:
                if x["risk_quarter_id"] == rq["id"] and x["assessor_line"] == 1:
                    x.update(status="not_assessed", score=None, predicate=None)
    opened = []
    for o in change["opened"]:
        r = ComparisonResult.objects.create(
            risk_quarter_id=rq["id"],
            lini3_position_id=o["lini3_position_id"],
            opened_at=at,
            result=o["result"],
            lini1_higher=o["lini1_higher"],
            explanation_required=o["explanation_required"],
            explanation_status=o["explanation_status"],
            explanation_due_on=o["explanation_due_on"],
        )
        row = {
            **o,
            "id": str(r.id),
            "risk_quarter_id": rq["id"],
            "opened_at": _iso(at),
            "explanation_reason": None,
            "explanation_plan": None,
            "explanation_sent_at": None,
            "explanation_sent_by_user_id": None,
            "explanation_lateness": None,
        }
        db["results"].append(row)
        opened.append(row)
    first = RiskQuarter.objects.get(pk=rq["id"]).first_opened_at or at
    RiskQuarter.objects.filter(pk=rq["id"]).update(
        comparison_status=change["comparison_status"], first_opened_at=first
    )
    rq.update(comparison_status=change["comparison_status"], first_opened_at=_iso(first))
    return opened


def _opened_rqs(db: Db, opened: dict[str, list[Row]]) -> list[Row]:
    return [rq for rq in db["risk_quarters"] if rq["id"] in opened]


def _register_of(db: Db, rq: Row) -> tuple[Row, Row]:
    risk = _find(db["risks"], "id", rq["register_risk_id"])
    assert risk is not None
    reg = _find(db["registers"], "id", risk["register_id"])
    assert reg is not None
    return risk, reg


def _recurrence(db: Db, opened: dict[str, list[Row]], as_of: dt.datetime, today: str) -> None:
    """FR-NIL-011: recurrence for opened risks and the following quarter of the same lineage."""
    recheck = set(opened)
    for rq_id in opened:
        nxt = next(
            (
                x
                for x in db["risk_quarters"]
                if (p := rules.previous_risk_quarter(db, x)) is not None and p["id"] == rq_id
            ),
            None,
        )
        if nxt and any(r["risk_quarter_id"] == nxt["id"] for r in db["results"]):
            recheck.add(nxt["id"])
    for rq_id in recheck:
        rq = _find(db["risk_quarters"], "id", rq_id)
        assert rq is not None
        now = rules.is_recurring(db, rq)
        if now and not rq["recurring"]:
            RiskQuarter.objects.filter(pk=rq_id).update(recurring=True)
            rq["recurring"] = True
            risk, reg = _register_of(db, rq)
            own_opened = {
                r["lini3_position_id"] for r in db["results"] if r["risk_quarter_id"] == rq_id
            }
            lini2 = access.assigned_lini2(db, reg["position_id"], rq["quarter_id"])[:1]
            recipients = (
                set(holders_of(db, [reg["position_id"]], today))
                | set(holders_of(db, lini2, today))
                # VIS-9: only Lini 3 holders whose own result for this risk has opened.
                | set(holders_of(db, own_opened, today))
            )
            _send(
                recipients,
                kind="recurring",
                text=f"Risiko '{_short(risk['description_snapshot'])}' dinilai Kurang Terkendali "
                "oleh Lini 3 dua triwulan berturut-turut",
                target_url=f"/jabatan/{reg['position_id']}/papan/{reg['fiscal_year']}"
                f"/risiko/{risk['id']}",
                event_key=f"recurring:{rq_id}",
                at=as_of,
            )
        elif not now and rq["recurring"] and rq_id in opened:
            RiskQuarter.objects.filter(pk=rq_id).update(recurring=False)
            rq["recurring"] = False


def _message(q: Row, position: Row, results: list[Row]) -> str:
    ok = len([r for r in results if r["result"] == "sesuai"])
    bad = len([r for r in results if r["result"] == "tidak_sesuai"])
    return (
        f"Perbandingan {rules.tw_label(q)} {position['name']} dibuka: {ok} Sesuai, "
        f"{bad} Tidak Sesuai"
    )


def _notify_openings(
    db: Db, opened: dict[str, list[Row]], as_of: dt.datetime, at: str, today: str
) -> None:
    """FR-NTF-007 and FR-NTF-009, grouped per position and quarter."""
    groups: dict[tuple[str, str], list[str]] = {}
    for rq_id in opened:
        rq = _find(db["risk_quarters"], "id", rq_id)
        assert rq is not None
        _, reg = _register_of(db, rq)
        groups.setdefault((reg["position_id"], rq["quarter_id"]), []).append(rq_id)
    for (position_id, quarter_id), rq_list in groups.items():
        q = _find(db["quarters"], "id", quarter_id)
        position = _find(db["positions"], "id", position_id)
        assert q is not None and position is not None
        fresh = [r for rq_id in rq_list for r in opened[rq_id]]
        url = f"/jabatan/{position_id}/penilaian/{q['fiscal_year']}/{q['number']}"
        key = f"cmp:{position_id}:{quarter_id}:{at[:16]}"
        everyone = set(holders_of(db, [position_id], today)) | set(
            holders_of(db, access.assigned_lini2(db, position_id, quarter_id), today)
        )
        _send(
            everyone,
            kind="comparison_opened",
            text=_message(q, position, fresh),
            target_url=url,
            event_key=key,
            at=as_of,
        )
        for l3 in board_rules.expected_lini3(db, quarter_id):
            # VIS-9: a Lini 3 position counts only risks whose own result has opened.
            own = [
                r
                for r in fresh
                if any(
                    x["risk_quarter_id"] == r["risk_quarter_id"] and x["lini3_position_id"] == l3
                    for x in db["results"]
                )
            ]
            if not own:
                continue
            _send(
                [u for u in holders_of(db, [l3], today) if u not in everyone],
                kind="comparison_opened",
                text=_message(q, position, own),
                target_url=url,
                event_key=key,
                at=as_of,
            )
        mandatory = [r for r in fresh if r["explanation_required"]]
        if mandatory:
            due = min(str(r["explanation_due_on"]) for r in mandatory)
            risks = len({r["risk_quarter_id"] for r in mandatory})
            _send(
                holders_of(db, [position_id], today),
                kind="explanation_required",
                text=f"{risks} risiko memerlukan penjelasan paling lambat "
                f"{format_date(dt.date.fromisoformat(due))}",
                target_url=url,
                event_key=f"expl:{position_id}:{quarter_id}:{at[:16]}",
                at=as_of,
            )


@transaction.atomic
def run_comparisons(as_of: dt.datetime, rq_ids: Iterable[Any] | None = None) -> None:
    """Evaluates opening for the given risk-quarters (all when None), then recurrence, then
    notifications."""
    at = _iso(as_of)
    today = at[:10]
    qs = RiskQuarter.objects.filter(quarter__lini3_opens_on__lte=today).exclude(
        quarter__fiscal_year__status="archived"
    )
    if rq_ids is not None:
        qs = qs.filter(pk__in=[str(i) for i in rq_ids])
    ids = list(qs.values_list("id", flat=True))
    if not ids:
        return
    # Serialises concurrent finalises and task runs over the same risk-quarters. Locked without
    # joins, so Quarter and FiscalYear rows stay free (archive, other quarters' finalises).
    locked = list(
        RiskQuarter.objects.select_for_update()
        .filter(pk__in=ids)
        .order_by("pk")
        .values_list("id", flat=True)
    )
    positions = set(
        RiskQuarter.objects.filter(pk__in=locked).values_list(
            "register_risk__register__position_id", flat=True
        )
    )
    db = assessment_db(positions)
    candidates = {str(i) for i in locked}
    opened: dict[str, list[Row]] = {}
    for rq in db["risk_quarters"]:
        if rq["id"] not in candidates:
            continue
        change = rules.evaluate_opening(db, rq, at)
        if change:
            opened[rq["id"]] = _persist(db, rq, change, as_of)
    if not opened:
        return
    _recurrence(db, opened, as_of, today)
    _notify_openings(db, opened, as_of, at, today)
    # U-07: an opening (also a late one) can complete a quarter's sheet.
    from simario.sheets.services import run_sheet_freeze

    run_sheet_freeze(
        as_of, {_register_of(db, rq)[1]["position_id"] for rq in _opened_rqs(db, opened)}
    )
