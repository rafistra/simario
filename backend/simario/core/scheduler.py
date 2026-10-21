"""Scheduled task registry (spec §4.8). Each task is `fn(as_of)`, idempotent and safe when the
clock jumps far ahead. Celery Beat runs them every 15 minutes; the DevPanel clock runs them
synchronously."""

import datetime as dt
from collections.abc import Callable

Task = Callable[[dt.datetime], None]

_TASKS: dict[str, Task] = {}


def register(name: str) -> Callable[[Task], Task]:
    def decorate(fn: Task) -> Task:
        _TASKS[name] = fn
        return fn

    return decorate


# The prototype's order (frontend/src/data/local/scheduler.ts): openings and sheet versions come
# before the calendar may archive a year; tasks not listed run afterwards in registration order.
ORDER = (
    "attachment_scan",
    "risk_quarters",
    "score_bands",
    "comparisons",
    "reminders",
    "sheet_freeze",
    "calendar",
    "delegations",
)


def run_all(as_of: dt.datetime) -> list[str]:
    names = [n for n in ORDER if n in _TASKS] + [n for n in _TASKS if n not in ORDER]
    for name in names:
        _TASKS[name](as_of)
    return names
