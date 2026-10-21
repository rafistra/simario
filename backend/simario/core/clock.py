"""The single source of time for business rules (spec §4.5). With SIMARIO_DEV_TOOLS on, a
DevClock row shifts it (DevPanel, demos); otherwise it is real time. Rules never call
timezone.now() directly."""

import datetime as dt
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

WITA = ZoneInfo("Asia/Makassar")


def _dev_clock() -> tuple[dt.datetime, dt.datetime] | None:
    if not settings.SIMARIO_DEV_TOOLS:
        return None
    from simario.devtools.models import DevClock

    row = DevClock.objects.filter(pk=1).first()
    return (row.sim_base, row.real_base) if row else None


def now() -> dt.datetime:
    real = timezone.now()
    shifted = _dev_clock()
    if shifted:
        sim_base, real_base = shifted
        real = sim_base + (real - real_base)
    return real.astimezone(WITA)


def today() -> dt.date:
    return now().date()


def set_now(at: dt.datetime) -> None:
    if not settings.SIMARIO_DEV_TOOLS:
        raise RuntimeError("The simulated clock needs SIMARIO_DEV_TOOLS")
    from simario.devtools.models import DevClock

    DevClock.objects.update_or_create(pk=1, defaults={"sim_base": at, "real_base": timezone.now()})


def parse_local(value: str) -> dt.datetime:
    """`YYYY-MM-DDTHH:mm` read as WITA (the prototype's ISODateTime)."""
    return dt.datetime.strptime(value[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=WITA)
