"""Staff directory search through the Keycloak Admin REST API (OQ-11). The `simario` client's
service account needs the realm-management role `view-users`. Moving to sso.ikn.go.id only
changes the OIDC_* settings."""

from typing import Any

import requests
from django.conf import settings

from simario.core.errors import ApiError

from .models import User

TIMEOUT = 5
UNAVAILABLE = "Pencarian pegawai belum tersedia."
LIMIT = 8


def _unavailable() -> ApiError:
    return ApiError("server", UNAVAILABLE, status=503)


def _base() -> tuple[str, str]:
    """(server root, realm) as the backend reaches them."""
    issuer = (settings.OIDC_BACKCHANNEL_URL or settings.OIDC_ISSUER).rstrip("/")
    root, _, realm = issuer.rpartition("/realms/")
    return root, realm


def _token(root: str, realm: str) -> str:
    res = requests.post(
        f"{root}/realms/{realm}/protocol/openid-connect/token",
        data={
            "grant_type": "client_credentials",
            "client_id": settings.OIDC_CLIENT_ID,
            "client_secret": settings.OIDC_CLIENT_SECRET,
        },
        timeout=TIMEOUT,
    )
    res.raise_for_status()
    return str(res.json()["access_token"])


def _row(kc_user: dict[str, Any]) -> dict[str, str] | None:
    nip = (kc_user.get("attributes") or {}).get(settings.OIDC_NIP_CLAIM) or []
    if not nip:
        return None
    name = " ".join(p for p in (kc_user.get("firstName"), kc_user.get("lastName")) if p)
    return {
        "nip": str(nip[0]),
        "full_name": name or str(kc_user.get("username", "")),
        "email": str(kc_user.get("email", "")),
        "org_unit_id": "",
    }


def search_staff(query: str) -> list[dict[str, str]]:
    q = query.strip()
    if len(q) < 2:
        return []
    if not settings.OIDC_ISSUER:
        raise _unavailable()
    root, realm = _base()
    try:
        token = _token(root, realm)
        res = requests.get(
            f"{root}/admin/realms/{realm}/users",
            params={"search": q, "max": str(LIMIT), "briefRepresentation": "false"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        res.raise_for_status()
        users = res.json()
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise _unavailable() from exc
    rows = [row for u in users if (row := _row(u))][:LIMIT]
    # Staff already registered keep their unit (FR-ADM-010 picker).
    units = dict(
        User.objects.filter(nip__in=[r["nip"] for r in rows]).values_list("nip", "org_unit_id")
    )
    for row in rows:
        row["org_unit_id"] = str(units[row["nip"]] or "") if row["nip"] in units else ""
    return rows
