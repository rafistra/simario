"""Final review B7 fixes: task order, snapshot/quarter match, freeze lock order."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from simario.core import clock, scheduler
from simario.devtools.seed import legacy_uuid
from simario.sheets.models import PrintSnapshot
from simario.sheets.services import run_sheet_freeze
from tests.demo import client_for, uid


def test_calendar_runs_after_comparisons_and_freezing(demo: None) -> None:
    """The prototype archives last, so a far jump freezes and opens before the year closes."""
    order = scheduler.run_all(clock.parse_local("2027-04-06T09:00"))
    assert order.index("calendar") > order.index("comparisons")
    assert order.index("calendar") > order.index("sheet_freeze")
    assert order[0] == "risk_quarters"


def test_snapshot_must_belong_to_the_viewed_quarter(demo: None) -> None:
    old = PrintSnapshot.objects.get(quarter_id=legacy_uuid("q-2026-4"), kind="komunikasi")
    url = f"/api/v1/positions/{uid('pos-ppk-a1')}/sheets/2027/1?snapshot={old.id}"
    res = client_for("usr-andi").get(url)
    assert res.status_code == 404
    assert res.json()["message"] == "Salinan beku tidak ditemukan."


def test_freeze_locks_the_position_before_comparing(demo: None) -> None:
    with CaptureQueriesContext(connection) as ctx:
        run_sheet_freeze(clock.parse_local("2027-04-21T09:00"), {uid("pos-ppk-a1")})
    sqls = [q["sql"] for q in ctx.captured_queries]
    lock = next(i for i, s in enumerate(sqls) if "FOR UPDATE" in s and "org_position" in s)
    first_snapshot_read = next(i for i, s in enumerate(sqls) if "sheets_printsnapshot" in s)
    assert lock < first_snapshot_read
