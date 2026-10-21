"""Shared helpers for API tests that run on the demo seed."""

from rest_framework.test import APIClient

from simario.accounts.models import User
from simario.devtools.seed import legacy_uuid


def user(prototype_id: str) -> User:
    return User.objects.get(pk=legacy_uuid(prototype_id))


def client_for(prototype_id: str) -> APIClient:
    client = APIClient()
    client.force_login(user(prototype_id))
    return client


def uid(prototype_id: str) -> str:
    return str(legacy_uuid(prototype_id))
