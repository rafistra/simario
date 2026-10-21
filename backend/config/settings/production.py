from django.core.exceptions import ImproperlyConfigured

from .base import SIMARIO_DEV_TOOLS
from .deployed import *  # noqa: F403

if SIMARIO_DEV_TOOLS:
    raise ImproperlyConfigured("SIMARIO_DEV_TOOLS must be false in production")
