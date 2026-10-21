"""Smoke test of a running production-style stack (docker-compose.prod.yml).

Usage (from backend/, stack up, Superadmin created with create_superadmin):
  uv run python ../infra/smoke.py https://localhost:8443 <nip> <temp-password> [env-file]

Checks: HTTPS SPA (incl. a deep link), health, CSRF + local sign-in, forced password change, /me,
and a pre-signed download through /storage (an object is written and signed inside the api
container). Cookies are kept by hand: Python's cookie jar mishandles the host "localhost"."""

import os
import subprocess
import sys
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any

import requests
import urllib3

urllib3.disable_warnings()
REPO = Path(__file__).resolve().parents[1]


class Client:
    def __init__(self, base: str) -> None:
        self.base = base
        self.cookies: dict[str, str] = {}

    def call(self, method: str, path: str, **kw: Any) -> requests.Response:
        headers = kw.pop("headers", {})
        headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        if method != "GET":
            headers["X-CSRFToken"] = self.cookies.get("csrftoken", "")
            headers["Referer"] = f"{self.base}/"
        res = requests.request(method, f"{self.base}{path}", headers=headers, verify=False, **kw)
        for raw in res.raw.headers.getlist("Set-Cookie"):
            jar: SimpleCookie = SimpleCookie()
            jar.load(raw)
            for key, morsel in jar.items():
                self.cookies[key] = morsel.value
        return res


def main(base: str, nip: str, password: str, env_file: str = ".env.prod.local") -> None:
    c = Client(base)
    ok = True

    def check(label: str, cond: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= cond
        print(f"{'OK  ' if cond else 'FAIL'} {label} {detail}")

    index = c.call("GET", "/")
    check("SPA index", index.status_code == 200 and 'id="root"' in index.text)
    check("SPA deep link", c.call("GET", "/jabatan/x/register/2027").status_code == 200)
    health = c.call("GET", "/api/v1/health")
    check("health", health.status_code == 200, health.text[:160])
    c.call("GET", "/api/v1/auth/config")
    login = c.call("POST", "/api/v1/auth/login", json={"nip": nip, "password": password})
    check("local sign-in", login.status_code == 200, login.text[:100])
    change = c.call(
        "POST",
        "/api/v1/auth/password",
        json={"oldPassword": password, "newPassword": password + "-Baru2027"},
    )
    check("password change", change.status_code == 204, change.text[:100])
    me = c.call("GET", "/api/v1/me")
    check("/me", me.status_code == 200 and me.json().get("user", {}).get("nip") == nip)
    script = (
        "from simario.board import files;"
        "files.put('smoke/hello.txt', b'halo', 'text/plain');"
        "print(files.presigned_url('smoke/hello.txt', 'hello.txt'))"
    )
    env = {**os.environ, "SIMARIO_ENV_FILE": env_file}
    url = subprocess.run(
        ["docker", "compose", "-f", "docker-compose.prod.yml", "--env-file", env_file, "exec",
         "-T", "api", "python", "manage.py", "shell", "-c", script],
        capture_output=True, text=True, check=True, cwd=REPO, env=env,
    ).stdout.strip().splitlines()[-1]
    dl = c.call("GET", url)
    check("pre-signed download via /storage", dl.status_code == 200 and dl.content == b"halo")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(*sys.argv[1:5])
