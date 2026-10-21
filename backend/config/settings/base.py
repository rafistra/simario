"""Settings shared by every environment. Values come from environment variables; a local
`.env` (default: repo root, override with SIMARIO_ENV_FILE) fills in what the process lacks."""

import os
from pathlib import Path

import environ

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent

env = environ.Env()
environ.Env.read_env(os.environ.get("SIMARIO_ENV_FILE", str(REPO_DIR / ".env")))

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS: list[str] = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "django_celery_beat",
    "simario.core",
    "simario.accounts",
    "simario.org",
    "simario.calendar",
    "simario.reference",
    "simario.imports",
    "simario.registers",
    "simario.assessments",
    "simario.board",
    "simario.devtools",
    "simario.audit",
    "simario.notifications",
    "mozilla_django_oidc",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "simario.core.middleware.ApiErrorMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "simario.accounts.middleware.AuthEpochMiddleware",
]

AUTH_USER_MODEL = "accounts.User"

ROOT_URLCONF = "config.urls"
# API paths have no trailing slash (docs/03_api_contract.md); a slashed variant is a 404.
APPEND_SLASH = False
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    }
]

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"].setdefault("OPTIONS", {})["connect_timeout"] = 2
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "id"
TIME_ZONE = "Asia/Makassar"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BACKEND_DIR / "staticfiles"

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

S3_ENDPOINT_URL = env("S3_ENDPOINT_URL", default="http://localhost:9000")
S3_ACCESS_KEY = env("S3_ACCESS_KEY", default="")
S3_SECRET_KEY = env("S3_SECRET_KEY", default="")
S3_BUCKET = env("S3_BUCKET", default="simario")
# Downloads (spec §4.7): URLs are signed for the storage host the proxy forwards to and served
# under the application origin, so RustFS is never exposed to the browser.
S3_PUBLIC_ENDPOINT = env("S3_PUBLIC_ENDPOINT", default="http://127.0.0.1:9100")
S3_PUBLIC_PREFIX = env("S3_PUBLIC_PREFIX", default="/storage")

CLAMAV_HOST = env("CLAMAV_HOST", default="localhost")
CLAMAV_PORT = env.int("CLAMAV_PORT", default=3310)

OIDC_ISSUER = env("OIDC_ISSUER", default="")
OIDC_CLIENT_ID = env("OIDC_CLIENT_ID", default="")
OIDC_CLIENT_SECRET = env("OIDC_CLIENT_SECRET", default="")
OIDC_NIP_CLAIM = env("OIDC_NIP_CLAIM", default="nip")
OIDC_REDIRECT_URI = env("OIDC_REDIRECT_URI", default="")

SIMARIO_DEV_TOOLS = env.bool("SIMARIO_DEV_TOOLS", default=False)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["djangorestframework_camel_case.render.CamelCaseJSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
        "djangorestframework_camel_case.parser.CamelCaseFormParser",
        "djangorestframework_camel_case.parser.CamelCaseMultiPartParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "simario.core.pagination.PagePagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "simario.core.errors.api_exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    # Keys inside these values are data (identity fields, audit snapshots), not field names.
    "JSON_UNDERSCOREIZE": {
        "no_underscore_before_number": True,  # lini1OpensOn -> lini1_opens_on
        "ignore_fields": ("identity", "identity_schema", "before", "after", "extra"),
        "ignore_keys": None,
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SIMARIO API",
    "VERSION": "1",
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    "ENUM_NAME_OVERRIDES": {"ImportKindEnum": "simario.imports.models.ImportJob.KINDS"},
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "drf_spectacular.contrib.djangorestframework_camel_case.camelize_serializer_fields",
    ],
    "APPEND_COMPONENTS": {
        "schemas": {
            "ApiError": {
                "type": "object",
                "required": ["code", "message", "details"],
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "details": {"nullable": True},
                },
            }
        }
    },
}

CELERY_BROKER_URL = REDIS_URL
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "endpoint_url": S3_ENDPOINT_URL,
            "access_key": S3_ACCESS_KEY,
            "secret_key": S3_SECRET_KEY,
            "bucket_name": S3_BUCKET,
            "region_name": "us-east-1",
            "addressing_style": "path",
            "querystring_expire": 300,
            "file_overwrite": False,
        },
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

CELERY_BEAT_SCHEDULE = {
    "run-scheduled": {"task": "simario.core.tasks.run_scheduled", "schedule": 15 * 60},
}

# Sessions (NFR-008): 60 minutes of inactivity, cookie only (BFF; tokens never reach the browser).
SESSION_COOKIE_AGE = 3600
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# SSO (spec §4.4). OIDC_BACKCHANNEL_URL is how the server reaches the issuer when the browser
# address differs (docker compose: http://keycloak:8080/...); empty = same as OIDC_ISSUER.
OIDC_BACKCHANNEL_URL = env("OIDC_BACKCHANNEL_URL", default="")
OIDC_RP_CLIENT_ID = OIDC_CLIENT_ID
OIDC_RP_CLIENT_SECRET = OIDC_CLIENT_SECRET
OIDC_RP_SIGN_ALGO = "RS256"
OIDC_RP_SCOPES = "openid"
OIDC_CREATE_USER = True  # routed to SimarioOIDCBackend.create_user, which refuses and audits
OIDC_CALLBACK_CLASS = "simario.accounts.oidc.SimarioCallbackView"
LOGIN_REDIRECT_URL = "/"
LOGIN_REDIRECT_URL_FAILURE = "/login?alasan=sso-gagal"
AUTHENTICATION_BACKENDS = [
    "simario.accounts.oidc.SimarioOIDCBackend",
    "django.contrib.auth.backends.ModelBackend",
]
if OIDC_ISSUER:
    from simario.accounts.oidc_config import oidc_endpoints

    globals().update(oidc_endpoints(OIDC_ISSUER, OIDC_BACKCHANNEL_URL))
