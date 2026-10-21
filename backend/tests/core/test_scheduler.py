import datetime as dt
from collections.abc import Iterator

import pytest

from simario.core import scheduler


@pytest.fixture
def isolated_registry(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(scheduler, "_TASKS", {})
    yield


def test_run_all_calls_registered_in_order(isolated_registry: None) -> None:
    seen: list[tuple[str, dt.datetime]] = []
    at = dt.datetime(2027, 4, 6, 9, tzinfo=dt.UTC)

    @scheduler.register("first")
    def first(as_of: dt.datetime) -> None:
        seen.append(("first", as_of))

    @scheduler.register("second")
    def second(as_of: dt.datetime) -> None:
        seen.append(("second", as_of))

    assert scheduler.run_all(at) == ["first", "second"]
    assert seen == [("first", at), ("second", at)]
