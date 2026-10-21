"""Dependency checks for GET /api/v1/health/. Each check returns False instead of raising."""

import socket
from collections.abc import Callable

import redis
from django.conf import settings
from django.db import connection

from .storage import s3_client

TIMEOUT_SECONDS = 2


def check_database() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def check_redis() -> bool:
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=TIMEOUT_SECONDS)
        return bool(client.ping())
    except Exception:
        return False


def check_storage() -> bool:
    try:
        s3_client().head_bucket(Bucket=settings.S3_BUCKET)
        return True
    except Exception:
        return False


def check_clamav() -> bool:
    try:
        with socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=TIMEOUT_SECONDS
        ) as sock:
            sock.sendall(b"zPING\0")
            return sock.recv(16).rstrip(b"\0\n") == b"PONG"
    except Exception:
        return False


CHECKS: dict[str, Callable[[], bool]] = {
    "database": check_database,
    "redis": check_redis,
    "storage": check_storage,
    "clamav": check_clamav,
}
