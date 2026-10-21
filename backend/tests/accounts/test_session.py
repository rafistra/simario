from django.conf import settings
from rest_framework.test import APIClient

from simario.accounts.models import User

from .conftest import LOCAL_PASSWORD


def test_session_expiry_is_60_minutes(client: APIClient, local_user: User) -> None:
    client.post(
        "/api/v1/auth/login", {"nip": local_user.nip, "password": LOCAL_PASSWORD}, format="json"
    )
    assert settings.SESSION_COOKIE_AGE == 3600
    assert settings.SESSION_SAVE_EVERY_REQUEST is True
    assert client.session.get_expiry_age() == 3600


def test_logout_ends_session(client: APIClient, local_user: User) -> None:
    client.force_login(local_user)
    assert client.post("/api/v1/auth/logout").status_code == 204
    res = client.post("/api/v1/auth/password", {"newPassword": "x" * 12}, format="json")
    assert res.status_code == 401
