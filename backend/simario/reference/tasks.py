"""Scheduled tasks of reference data (spec 4.8)."""

import datetime as dt

from django.db import transaction

from simario.calendar.models import Quarter
from simario.core import scheduler

from .models import ScoreBandVersion


@scheduler.register("score_bands")
@transaction.atomic
def activate_score_bands(as_of: dt.datetime) -> None:
    """FR-MST-007: a scheduled version becomes the single active version on its effective date;
    each quarter fixes its version when its first window opens (an open quarter keeps it)."""
    day = as_of.date()
    due = ScoreBandVersion.objects.filter(status="scheduled", effective_from__lte=day).order_by(
        "effective_from"
    )
    for version in due:
        ScoreBandVersion.objects.filter(status="active").update(status="retired")
        version.status = "active"
        version.save(update_fields=["status"])
    active = ScoreBandVersion.objects.filter(status="active").first()
    if active is None:
        return
    for q in Quarter.objects.filter(score_band_version=None):
        if min(q.lini1_opens_on, q.lini3_opens_on) <= day:
            q.score_band_version = active
            q.save(update_fields=["score_band_version"])
