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


def run_all(as_of: dt.datetime) -> list[str]:
    ran = []
    for name, fn in list(_TASKS.items()):
        fn(as_of)
        ran.append(name)
    return ran
