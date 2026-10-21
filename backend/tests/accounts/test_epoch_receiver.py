import gc

from rest_framework.test import APIClient

from simario.accounts.middleware import SESSION_EPOCH_KEY
from tests.demo import user


def test_login_records_epoch_after_garbage_collection(demo: None) -> None:
    """The user_logged_in receiver must survive gc (it is a nested function)."""
    gc.collect()
    client = APIClient()
    client.force_login(user("usr-andi"))
    assert SESSION_EPOCH_KEY in client.session
    assert client.get("/api/v1/me").status_code == 200


def test_epoch_receiver_is_held_strongly() -> None:
    """A weakly held nested function dies under gunicorn: sessions then never get an epoch."""
    import weakref

    from django.contrib.auth.signals import user_logged_in

    entries = [e for e in user_logged_in.receivers if "simario_remember_epoch" in str(e[0])]
    assert entries
    assert not isinstance(entries[0][1], weakref.ReferenceType)
