"""Scheduled tasks of the calendar (spec 4.8)."""

import datetime as dt

from django.db import transaction

from simario.core import scheduler

from .services import run_calendar


@scheduler.register("calendar")
@transaction.atomic
def calendar_task(as_of: dt.datetime) -> None:
    run_calendar(as_of)
