"""Bucket export/import for backup and restore (NFR-014), with S3 replaced by a fake."""

import io
import json
import tarfile
from typing import Any

import pytest
from django.core.management import call_command

from simario.core.management.commands import backup_manifest, bucket_export, bucket_import


class FakeS3:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects

    def get_paginator(self, name: str) -> Any:
        store = self

        class P:
            def paginate(self, **kw: Any) -> list[dict[str, Any]]:
                return [{"Contents": [{"Key": k} for k in sorted(store.objects)]}]

        return P()

    def get_object(self, Bucket: str, Key: str) -> dict[str, Any]:  # noqa: N803
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket: str, Key: str, Body: bytes, **kw: Any) -> None:  # noqa: N803
        self.objects[Key] = Body


def test_bucket_round_trip(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    source = FakeS3({"attachments/a/2027/1": b"satu", "quarantine/x": b"dua"})
    monkeypatch.setattr(bucket_export, "s3_client", lambda: source)
    out = tmp_path / "bucket.tar"
    call_command("bucket_export", str(out))
    with tarfile.open(out) as tar:
        assert sorted(tar.getnames()) == ["attachments/a/2027/1", "quarantine/x"]
    target = FakeS3({})
    monkeypatch.setattr(bucket_import, "s3_client", lambda: target)
    call_command("bucket_import", str(out))
    assert target.objects == source.objects


@pytest.mark.django_db
def test_manifest_counts(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    monkeypatch.setattr(backup_manifest, "s3_client", lambda: FakeS3({"k": b"v"}))
    out = tmp_path / "manifest.json"
    call_command("backup_manifest", str(out))
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["objects"] == 1 and "audit_auditlog" in data["tables"]
