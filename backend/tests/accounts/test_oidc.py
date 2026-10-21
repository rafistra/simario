from typing import Any

import pytest
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpRequest, HttpResponse
from django.test import RequestFactory

from simario.accounts.models import User
from simario.accounts.oidc import SimarioCallbackView, SimarioOIDCBackend, oidc_endpoints
from simario.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def _request() -> HttpRequest:
    request = RequestFactory().get("/oidc/callback/")
    SessionMiddleware(lambda r: HttpResponse()).process_request(request)
    return request


def _backend(claims: dict[str, Any], request: HttpRequest) -> SimarioOIDCBackend:
    backend = SimarioOIDCBackend()
    backend.request = request
    backend.get_userinfo = lambda *args, **kwargs: claims
    return backend


def test_known_nip_signs_in(sso_user: User) -> None:
    request = _request()
    user = _backend({"nip": sso_user.nip, "sub": "kc-1"}, request).get_or_create_user("a", "i", {})
    assert user == sso_user
    sso_user.refresh_from_db()
    assert sso_user.keycloak_sub == "kc-1"


def test_unknown_nip_is_rejected_and_audited(db: None) -> None:
    request = _request()
    user = _backend({"nip": "199812012024011001", "sub": "kc-2"}, request).get_or_create_user(
        "a", "i", {}
    )
    assert user is None
    assert not User.objects.filter(nip="199812012024011001").exists()
    entry = AuditLog.objects.get(action="masuk_ditolak_belum_terdaftar")
    assert entry.entity_type == "User" and entry.entity_id == "199812012024011001"
    assert request.session["oidc_failure"] == "belum-terdaftar"


def test_inactive_user_is_rejected(sso_user: User) -> None:
    sso_user.is_active = False
    sso_user.save()
    request = _request()
    _backend({"nip": sso_user.nip, "sub": "kc-1"}, request).get_or_create_user("a", "i", {})
    assert request.session["oidc_failure"] == "tidak-aktif"


def test_failure_redirect_carries_reason(db: None) -> None:
    view = SimarioCallbackView()
    view.request = _request()
    view.request.session["oidc_failure"] = "belum-terdaftar"
    assert view.failure_url == "/login?alasan=belum-terdaftar"
    assert view.failure_url == "/login?alasan=sso-gagal"


def test_backchannel_defaults_to_issuer() -> None:
    issuer = "http://localhost:8080/realms/otorita-ikn"
    ends = oidc_endpoints(issuer, "")
    assert ends["OIDC_OP_AUTHORIZATION_ENDPOINT"] == f"{issuer}/protocol/openid-connect/auth"
    assert ends["OIDC_OP_TOKEN_ENDPOINT"] == f"{issuer}/protocol/openid-connect/token"
    inner = oidc_endpoints(issuer, "http://keycloak:8080/realms/otorita-ikn")
    assert inner["OIDC_OP_AUTHORIZATION_ENDPOINT"].startswith("http://localhost:8080")
    assert inner["OIDC_OP_JWKS_ENDPOINT"] == (
        "http://keycloak:8080/realms/otorita-ikn/protocol/openid-connect/certs"
    )
