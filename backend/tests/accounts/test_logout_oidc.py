from typing import Any
from urllib.parse import parse_qs, urlparse

from tests.demo import client_for


def test_local_sign_out_has_no_redirect(demo: None) -> None:
    res = client_for("usr-andi").post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert res.json() == {"redirectUrl": None}


def test_sso_sign_out_ends_the_keycloak_session(demo: None, settings: Any) -> None:
    """R-10: after an SSO sign-in, sign-out also ends the Keycloak session."""
    settings.OIDC_ISSUER = "https://sso.example.go.id/realms/otorita-ikn"
    client = client_for("usr-andi")
    session = client.session
    session["oidc_id_token"] = "id-token-123"
    session.save()
    res = client.post("/api/v1/auth/logout")
    url = urlparse(res.json()["redirectUrl"])
    assert url.netloc == "sso.example.go.id"
    assert url.path == "/realms/otorita-ikn/protocol/openid-connect/logout"
    query = parse_qs(url.query)
    assert query["id_token_hint"] == ["id-token-123"]
    assert query["post_logout_redirect_uri"][0].endswith("/login")
    assert client.get("/api/v1/me").status_code == 401
