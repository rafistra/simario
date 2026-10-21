import pytest

from simario.accounts.models import User
from simario.notifications.models import Notification
from simario.notifications.services import notify

pytestmark = pytest.mark.django_db


def _user(nip: str) -> User:
    return User.objects.create_user(nip=nip, full_name=nip)


def test_notify_is_idempotent_per_event_key() -> None:
    user = _user("1")
    first = notify(user=user, kind="deadline", text="t", target_url="/", event_key="k1")
    second = notify(user=user, kind="deadline", text="t", target_url="/", event_key="k1")
    assert first is not None
    assert second is None
    assert Notification.objects.filter(user=user).count() == 1


def test_same_event_key_for_two_users_creates_two() -> None:
    a, b = _user("1"), _user("2")
    notify(user=a, kind="deadline", text="t", target_url="/", event_key="k1")
    notify(user=b, kind="deadline", text="t", target_url="/", event_key="k1")
    assert Notification.objects.count() == 2
