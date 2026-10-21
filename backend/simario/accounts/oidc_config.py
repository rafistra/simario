"""OIDC endpoint settings; imported by settings, so no Django model imports here."""


def oidc_endpoints(issuer: str, backchannel: str) -> dict[str, str]:
    """The browser reaches `issuer`; the server reaches `backchannel` (defaults to `issuer`),
    e.g. http://keycloak:8080 inside docker compose."""
    inner = (backchannel or issuer).rstrip("/")
    issuer = issuer.rstrip("/")
    return {
        "OIDC_OP_AUTHORIZATION_ENDPOINT": f"{issuer}/protocol/openid-connect/auth",
        "OIDC_OP_TOKEN_ENDPOINT": f"{inner}/protocol/openid-connect/token",
        "OIDC_OP_USER_ENDPOINT": f"{inner}/protocol/openid-connect/userinfo",
        "OIDC_OP_JWKS_ENDPOINT": f"{inner}/protocol/openid-connect/certs",
    }
