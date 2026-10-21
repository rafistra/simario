from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import SIMARIO_DEV_TOOLS

DEBUG = False

if SIMARIO_DEV_TOOLS:
    raise ImproperlyConfigured("SIMARIO_DEV_TOOLS must be false in production")
