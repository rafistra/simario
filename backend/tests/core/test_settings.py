import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

BASE_ENV = {
    "SIMARIO_ENV_FILE": str(BACKEND / "does-not-exist.env"),
    "DJANGO_SECRET_KEY": "test",
    "DATABASE_URL": "postgres://u:p@localhost:5432/db",
}


def load_settings(module: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    keep = {k: v for k, v in os.environ.items() if k in ("PATH", "SYSTEMROOT", "PYTHONPATH")}
    return subprocess.run(
        [sys.executable, "-c", f"import {module}"],
        cwd=BACKEND,
        env={**keep, **env},
        capture_output=True,
        text=True,
    )


def test_production_rejects_dev_tools() -> None:
    res = load_settings("config.settings.production", {**BASE_ENV, "SIMARIO_DEV_TOOLS": "true"})
    assert res.returncode != 0
    assert "SIMARIO_DEV_TOOLS" in res.stderr


def test_production_loads_without_dev_tools() -> None:
    res = load_settings("config.settings.production", {**BASE_ENV, "SIMARIO_DEV_TOOLS": "false"})
    assert res.returncode == 0, res.stderr


def test_missing_secret_key_names_variable() -> None:
    env = {k: v for k, v in BASE_ENV.items() if k != "DJANGO_SECRET_KEY"}
    res = load_settings("config.settings.local", env)
    assert res.returncode != 0
    assert "DJANGO_SECRET_KEY" in res.stderr
