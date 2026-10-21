"""Bulk import jobs (FR-ADM-013): a dry run keeps its CSV; "Terapkan" re-checks and applies it."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class ImportJob(UUIDModel):
    KINDS = [("jabatan", "jabatan"), ("pejabat", "pejabat"), ("penugasan", "penugasan")]
    STATUSES = [("dry_run", "dry_run"), ("applied", "applied")]

    kind = models.CharField(max_length=16, choices=KINDS)
    status = models.CharField(max_length=16, choices=STATUSES, default="dry_run")
    rows = models.PositiveIntegerField(default=0)
    valid = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list)
    content = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField()
    applied_at = models.DateTimeField(null=True, blank=True)
