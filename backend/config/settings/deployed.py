"""Settings shared by staging and production (spec §4.11): behind nginx with HTTPS, secrets and
hosts from the environment, logs to stdout."""

from .base import *  # noqa: F403
from .base import MIDDLEWARE, env

DEBUG = False

# nginx terminates TLS and forwards the scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
# The container health check calls Django over plain HTTP inside the network.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
MIDDLEWARE = [*MIDDLEWARE, "django.middleware.clickjacking.XFrameOptionsMiddleware"]
# HSTS for subdomains and the preload list are decisions for the owner of the parent domain
# (ikn.go.id), not for this application.
SILENCED_SYSTEM_CHECKS = ["security.W005", "security.W021"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "line": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {"stdout": {"class": "logging.StreamHandler", "formatter": "line"}},
    "root": {"handlers": ["stdout"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {"django.security": {"level": "WARNING"}},
}
