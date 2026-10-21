"""Staging/production settings pass Django's deployment checks (spec §4.11)."""

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
ENV = {
    "DJANGO_SECRET_KEY": "x" * 64 + "-deploy-check-not-a-real-secret",
    "ALLOWED_HOSTS": "simario.example.go.id",
    "CSRF_TRUSTED_ORIGINS": "https://simario.example.go.id",
    "DATABASE_URL": "postgres://u:p@localhost:5432/x",
    "SIMARIO_DEV_TOOLS": "false",
    "SIMARIO_ENV_FILE": "/nonexistent",
}


def _check(settings: str, extra: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "SIMARIO_"))}
    env.update(ENV | (extra or {}))
    env["DJANGO_SETTINGS_MODULE"] = settings
    return subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_production_passes_deploy_checks() -> None:
    res = _check("config.settings.production")
    assert res.returncode == 0, res.stdout + res.stderr


def test_staging_passes_deploy_checks() -> None:
    res = _check("config.settings.staging", {"SIMARIO_DEV_TOOLS": "true"})
    assert res.returncode == 0, res.stdout + res.stderr


def test_production_refuses_dev_tools() -> None:
    res = _check("config.settings.production", {"SIMARIO_DEV_TOOLS": "true"})
    assert res.returncode != 0
    assert "SIMARIO_DEV_TOOLS must be false in production" in res.stderr
