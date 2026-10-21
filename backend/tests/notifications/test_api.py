from simario.notifications.models import Notification
from tests.demo import client_for, demo, user  # noqa: F401

LIST = "/api/v1/notifications"


def test_notifications_are_own_and_newest_first(demo: None) -> None:
    body = client_for("usr-andi").get(LIST).json()
    assert body["total"] == Notification.objects.filter(user=user("usr-andi")).count()
    stamps = [n["createdAt"] for n in body["results"]]
    assert stamps == sorted(stamps, reverse=True)
    assert all(n["userId"] == str(user("usr-andi").id) for n in body["results"])
    assert "eventKey" in body["results"][0]


def test_mark_read(demo: None) -> None:
    n = Notification.objects.filter(user=user("usr-andi"), read_at=None).first()
    assert n is not None
    res = client_for("usr-andi").post(f"{LIST}/{n.id}/read")
    assert res.status_code == 204
    n.refresh_from_db()
    assert n.read_at is not None


def test_mark_read_other_users_notification_is_404(demo: None) -> None:
    n = Notification.objects.filter(user=user("usr-siti")).first()
    assert n is not None
    res = client_for("usr-andi").post(f"{LIST}/{n.id}/read")
    assert res.status_code == 404


def test_read_all(demo: None) -> None:
    res = client_for("usr-andi").post(f"{LIST}/read-all")
    assert res.status_code == 204
    assert not Notification.objects.filter(user=user("usr-andi"), read_at=None).exists()
    assert Notification.objects.filter(user=user("usr-siti"), read_at=None).exists()
