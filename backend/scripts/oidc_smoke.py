"""Smoke test of the real SSO flow against the local Keycloak (spec §4.4).

Needs `docker compose up` (api, keycloak) and `npm run dev` (Vite proxy on :5173).
Usage: uv run python scripts/oidc_smoke.py <NIP> [password]

Signs in through http://localhost:5173/oidc/authenticate/, submits the Keycloak login form,
follows the callback and prints where it ends: GET /api/v1/me for a registered NIP, or the
/login?alasan=... page for a refused one.
"""

import html
import re
import sys

import requests

BASE = "http://localhost:5173"


def main(nip: str, password: str) -> int:
    s = requests.Session()
    s.get(f"{BASE}/api/v1/auth/config", timeout=60)
    page = s.get(f"{BASE}/oidc/authenticate/?next=/", timeout=60)
    match = re.search(r'<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"', page.text)
    if not match:
        print("FAIL: Keycloak login form not found at", page.url)
        return 1
    # Keycloak marks its login cookies Secure. Browsers treat localhost/127.0.0.1 as secure
    # contexts and send them over http; requests does not, so relax the flag locally.
    for cookie in s.cookies:
        cookie.secure = False
    done = s.post(
        html.unescape(match.group(1)),
        data={"username": nip, "password": password, "credentialId": ""},
        timeout=60,
    )
    print("landed:", done.url)
    if "/login?alasan=" in done.url:
        print("refused:", done.url.split("alasan=")[1])
        return 0
    if not done.url.startswith(BASE):
        print("FAIL: still at Keycloak (wrong credentials?)")
        return 1
    me = s.get(f"{BASE}/api/v1/me", timeout=60)
    print("me:", me.status_code, me.text[:200])
    return 0 if me.status_code == 200 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "simario-demo"))
