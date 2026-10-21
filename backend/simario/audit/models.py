"""Append-only audit trail (NFR-007, INV-6). A PostgreSQL trigger rejects UPDATE and DELETE;
TRUNCATE (dev reset only) is not affected."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class AuditLog(UUIDModel):
    ACTING_AS = [(v, v) for v in ("pejabat", "operator", "superadmin", "pengelola", "sistem")]

    at = models.DateTimeField(db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    acting_as = models.CharField(max_length=16, choices=ACTING_AS, null=True, blank=True)
    acting_position = models.ForeignKey(
        "org.Position", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.CharField(max_length=64, db_index=True)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
