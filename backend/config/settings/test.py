from .local import *  # noqa: F403

SIMARIO_DEV_TOOLS = True

# Fast hashing in tests only.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Celery tasks run inline, inside the test transaction (no broker, no worker).
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
