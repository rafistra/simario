from pathlib import Path

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

COMMITTED = Path(__file__).resolve().parents[2] / "openapi.yaml"


def test_schema_endpoint(client: APIClient) -> None:
    res = client.get("/api/v1/schema/")
    assert res.status_code == 200
    assert "openapi: 3" in res.content.decode()


def test_schema_has_api_error_component(client: APIClient) -> None:
    body = client.get("/api/v1/schema/").content.decode()
    assert "ApiError:" in body


def test_committed_schema_is_current(tmp_path: Path) -> None:
    out = tmp_path / "openapi.yaml"
    call_command("spectacular", "--file", str(out), "--validate", "--fail-on-warn")
    assert COMMITTED.exists(), "run: uv run python manage.py spectacular --file openapi.yaml"
    assert out.read_text(encoding="utf-8") == COMMITTED.read_text(encoding="utf-8"), (
        "openapi.yaml is stale: run uv run python manage.py spectacular --file openapi.yaml"
    )


@pytest.fixture(autouse=True)
def _db(db: None) -> None:
    pass
