"""The `reminders` task (FR-NTF-005, 006, 009 H-1, 012) on the demo seed."""

from simario.assessments.reminders import run_reminders
from simario.core import clock
from simario.notifications.models import Notification
from tests.demo import uid, user


def _run(when: str) -> None:
    run_reminders(clock.parse_local(when))


def _keys(persona: str, prefix: str) -> set[str]:
    return set(
        Notification.objects.filter(user=user(persona), event_key__startswith=prefix).values_list(
            "event_key", flat=True
        )
    )


def test_lini1_window_and_deadline_reminders(demo: None) -> None:
    """TW II: Lini 1 opens 1 Jun, deadline 25 Jun → buka, H-7 (18 Jun), H-1 (24 Jun)."""
    for when in ("2027-06-01T08:00", "2027-06-18T08:00", "2027-06-24T08:00"):
        _run(when)
    keys = _keys("usr-andi", f"ntf5:{uid('pos-ppk-a1')}:{uid('q-2027-2')}")
    assert {k.rsplit(":", 1)[1] for k in keys} == {"buka", "h7", "h1"}
    n = Notification.objects.filter(user=user("usr-andi"), event_key__startswith="ntf5:").first()
    assert n is not None and "tenggat 25 Jun 2027" in n.text


def test_lini3_reminders(demo: None) -> None:
    _run("2027-06-25T08:00")  # H-7 before the Lini 3 TW II deadline (2 Jul)
    assert _keys("usr-hendra", f"ntf6:{uid('pos-kepatuhan')}:{uid('q-2027-2')}:h7")


def test_explanation_h1(demo: None) -> None:
    _run("2027-04-08T08:00")  # TW I explanations due 9 Apr
    keys = _keys("usr-andi", "ntf9h1:")
    assert f"ntf9h1:{uid('pos-ppk-a1')}:2027-04-09" in keys


def test_reminders_idempotent_and_recent_only(demo: None) -> None:
    _run("2027-06-24T08:00")
    count = Notification.objects.count()
    _run("2027-06-24T09:00")
    assert Notification.objects.count() == count
    # A jump far past a moment raises nothing stale.
    _run("2027-08-20T08:00")
    assert not _keys("usr-andi", f"ntf5:{uid('pos-ppk-a1')}:{uid('q-2027-2')}:buka")
