import datetime as dt
from typing import Any

import pytest

from simario.core import clock

pytestmark = pytest.mark.django_db

WITA = dt.timedelta(hours=8)


def test_now_follows_dev_clock() -> None:
    clock.set_now(clock.parse_local("2027-04-06T09:00"))
    now = clock.now()
    assert now.utcoffset() == WITA
    assert now.strftime("%Y-%m-%dT%H:%M") in ("2027-04-06T09:00", "2027-04-06T09:01")
    assert clock.today() == dt.date(2027, 4, 6)


def test_now_is_real_time_without_dev_tools(settings: Any) -> None:
    clock.set_now(clock.parse_local("2027-04-06T09:00"))
    settings.SIMARIO_DEV_TOOLS = False
    assert clock.now().year != 2027 or clock.now().month != 4 or clock.now().day != 6


def test_set_now_refused_without_dev_tools(settings: Any) -> None:
    settings.SIMARIO_DEV_TOOLS = False
    with pytest.raises(RuntimeError):
        clock.set_now(clock.parse_local("2027-04-06T09:00"))


def test_parse_local_is_wita() -> None:
    at = clock.parse_local("2027-04-06T09:00")
    assert at.utcoffset() == WITA
    assert (at.hour, at.minute) == (9, 0)
