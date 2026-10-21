"""Scheduled tasks of quarterly assessment (spec 4.8)."""

import datetime as dt

from simario.core import scheduler

from .comparisons import run_comparisons


@scheduler.register("comparisons")
def comparisons(as_of: dt.datetime) -> None:
    """§2.5: opens comparisons whose conditions are met (all final, or the Lini 3 deadline
    passed), closes Lini 1 as "Tidak dinilai Lini 1", detects Berulang."""
    run_comparisons(as_of)
