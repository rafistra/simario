from typing import Any

import pytest
from botocore.exceptions import ClientError
from django.core.management import call_command

from simario.core.management.commands import init_storage


class FakeS3:
    def __init__(self, exists: bool) -> None:
        self.exists = exists
        self.created: list[dict[str, Any]] = []

    def head_bucket(self, **kwargs: Any) -> None:
        if not self.exists:
            raise ClientError({"Error": {"Code": "404"}}, "HeadBucket")

    def create_bucket(self, **kwargs: Any) -> None:
        self.created.append(kwargs)


def test_init_storage_creates_missing_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeS3(exists=False)
    monkeypatch.setattr(init_storage, "s3_client", lambda: fake)
    call_command("init_storage")
    assert fake.created == [{"Bucket": "simario"}]


def test_init_storage_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeS3(exists=True)
    monkeypatch.setattr(init_storage, "s3_client", lambda: fake)
    call_command("init_storage")
    assert fake.created == []
