import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.urls("tests.core.urls_testonly")


def test_api_error_envelope(client: APIClient) -> None:
    res = client.get("/api/v1/archived/")
    assert res.status_code == 409
    assert res.json() == {
        "code": "archived",
        "message": "Tahun anggaran sudah diarsipkan.",
        "details": None,
    }


def test_validation_details_are_camel_case(client: APIClient) -> None:
    res = client.get("/api/v1/invalid/")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation"
    assert body["message"] == "Isian belum valid."
    assert body["details"] == {"fiscalYear": ["wajib"]}


def test_unknown_api_path_returns_envelope(client: APIClient) -> None:
    res = client.get("/api/v1/tidak-ada/")
    assert res.status_code == 404
    assert res["Content-Type"].startswith("application/json")
    assert res.json()["code"] == "not_found"
    assert res.json()["message"] == "Data tidak ditemukan."


def test_unhandled_exception_returns_server_envelope() -> None:
    client = APIClient(raise_request_exception=False)
    res = client.get("/api/v1/boom/")
    assert res.status_code == 500
    assert res.json()["code"] == "server"
    assert res.json()["message"] == "Terjadi kesalahan pada server. Silakan coba lagi."
    assert "secret detail" not in res.content.decode()
    assert "RuntimeError" not in res.content.decode()
