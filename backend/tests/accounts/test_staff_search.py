from typing import Any

import pytest
import requests

from tests.demo import client_for


class _Response:
    def __init__(self, payload: Any) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self.payload


@pytest.fixture
def keycloak_on(settings: Any) -> None:
    settings.OIDC_ISSUER = "http://kc.test/realms/otorita-ikn"
    settings.OIDC_BACKCHANNEL_URL = ""
    settings.OIDC_CLIENT_ID = "simario"
    settings.OIDC_CLIENT_SECRET = "s3cret"


def test_staff_search_uses_keycloak(
    demo: None, keycloak_on: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, Any]] = []

    def fake_post(url: str, data: Any = None, timeout: float = 0) -> _Response:
        calls.append((url, data))
        return _Response({"access_token": "tok"})

    def fake_get(
        url: str, params: Any = None, headers: Any = None, timeout: float = 0
    ) -> _Response:
        calls.append((url, params))
        assert headers == {"Authorization": "Bearer tok"}
        return _Response(
            [
                {
                    "firstName": "Galih",
                    "lastName": "Pratama",
                    "email": "galih@ikn.go.id",
                    "attributes": {"nip": ["199701012022011001"]},
                },
                {"firstName": "Tanpa", "lastName": "NIP", "attributes": {}},
            ]
        )

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests, "get", fake_get)
    res = client_for("usr-andi").get("/api/v1/staff", {"q": "galih"})
    assert res.status_code == 200
    assert res.json() == [
        {
            "nip": "199701012022011001",
            "fullName": "Galih Pratama",
            "email": "galih@ikn.go.id",
            "orgUnitId": "",
        }
    ]
    assert calls[0][0] == "http://kc.test/realms/otorita-ikn/protocol/openid-connect/token"
    assert calls[0][1]["grant_type"] == "client_credentials"
    assert calls[1][0] == "http://kc.test/admin/realms/otorita-ikn/users"
    assert calls[1][1]["search"] == "galih"


def test_short_query_returns_nothing(demo: None, keycloak_on: None) -> None:
    assert client_for("usr-andi").get("/api/v1/staff", {"q": "g"}).json() == []


def test_staff_search_unavailable_message(
    demo: None, settings: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings.OIDC_ISSUER = ""
    res = client_for("usr-andi").get("/api/v1/staff", {"q": "galih"})
    assert res.status_code == 503
    assert res.json()["code"] == "server"
    assert res.json()["message"] == "Pencarian pegawai belum tersedia."

    settings.OIDC_ISSUER = "http://kc.test/realms/otorita-ikn"

    def down(*args: Any, **kwargs: Any) -> None:
        raise requests.ConnectionError("down")

    monkeypatch.setattr(requests, "post", down)
    res = client_for("usr-andi").get("/api/v1/staff", {"q": "galih"})
    assert res.status_code == 503
