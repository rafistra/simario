from typing import Any

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.urls("tests.core.urls_testonly")


def test_api_error_envelope(client: APIClient) -> None:
    res = client.get("/api/v1/archived")
    assert res.status_code == 409
    assert res.json() == {
        "code": "archived",
        "message": "Tahun anggaran sudah diarsipkan.",
        "details": None,
    }


def test_validation_details_are_camel_case(client: APIClient) -> None:
    res = client.get("/api/v1/invalid")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation"
    assert body["message"] == "Isian belum valid."
    assert body["details"] == {"fiscalYear": ["wajib"]}


def test_unknown_api_path_returns_envelope(client: APIClient) -> None:
    res = client.get("/api/v1/tidak-ada")
    assert res.status_code == 404
    assert res["Content-Type"].startswith("application/json")
    assert res.json()["code"] == "not_found"
    assert res.json()["message"] == "Data tidak ditemukan."


def test_unhandled_exception_returns_server_envelope() -> None:
    client = APIClient(raise_request_exception=False)
    res = client.get("/api/v1/boom")
    assert res.status_code == 500
    assert res.json()["code"] == "server"
    assert res.json()["message"] == "Terjadi kesalahan pada server. Silakan coba lagi."
    assert "secret detail" not in res.content.decode()
    assert "RuntimeError" not in res.content.decode()


def test_html_server_error_becomes_envelope(client: APIClient) -> None:
    res = client.get("/api/v1/plain-html-error")
    assert res.status_code == 500
    assert res["Content-Type"].startswith("application/json")
    assert res.json()["code"] == "server"


def test_unknown_api_path_returns_envelope_in_debug(client: APIClient, settings: Any) -> None:
    settings.DEBUG = True
    res = client.get("/api/v1/tidak-ada")
    assert res.status_code == 404
    assert res["Content-Type"].startswith("application/json")


def test_parse_error_is_validation(client: APIClient) -> None:
    res = client.post("/api/v1/echo", "{not json", content_type="application/json")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation"
    assert body["message"] == "Isian belum valid."
    assert "Expecting" not in res.content.decode()


def test_method_not_allowed_envelope(client: APIClient) -> None:
    res = client.delete("/api/v1/echo")
    assert res.status_code == 405
    assert res.json()["code"] == "method_not_allowed"
    assert res.json()["message"] == "Metode tidak didukung."


def test_unknown_api_error_code_raises() -> None:
    from simario.core.errors import ApiError

    with pytest.raises(ValueError):
        ApiError("archieved", "x")


def test_handler_calls_set_rollback(monkeypatch: pytest.MonkeyPatch) -> None:
    from simario.core import errors
    from simario.core.errors import ApiError, api_exception_handler

    calls: list[bool] = []
    monkeypatch.setattr(errors, "set_rollback", lambda: calls.append(True))
    api_exception_handler(ApiError("archived", "x"), {})
    assert calls == [True]


def test_bare_api_path_returns_envelope(client: APIClient) -> None:
    res = client.get("/api")
    assert res.status_code == 404
    assert res["Content-Type"].startswith("application/json")
