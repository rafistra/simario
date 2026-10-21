from .local import *  # noqa: F403

SIMARIO_DEV_TOOLS = True

# Fast hashing in tests only.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
