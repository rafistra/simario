"""Sheets (PRD ch. 9, §2.8.1): numbered print snapshots that never change (INV-22) and the shared
photo selection per position, quarter and section (FR-LBR-005)."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class PrintSnapshot(UUIDModel):
    KINDS = [("komunikasi", "komunikasi"), ("mutu", "mutu")]
    TRIGGERS = [(s, s) for s in ("print", "auto_freeze", "archive")]

    number = models.CharField(max_length=96, unique=True)
    position = models.ForeignKey("org.Position", on_delete=models.PROTECT, related_name="+")
    quarter = models.ForeignKey("calendar.Quarter", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=16, choices=KINDS)
    version = models.PositiveSmallIntegerField(null=True, blank=True)
    trigger = models.CharField(max_length=16, choices=TRIGGERS)
    is_provisional = models.BooleanField(default=False)
    superseded_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    payload = models.JSONField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["position", "quarter", "kind"])]


class SheetPhotoSelection(UUIDModel):
    SECTIONS = [(s, s) for s in ("A", "B", "C")]

    position = models.ForeignKey("org.Position", on_delete=models.CASCADE, related_name="+")
    quarter = models.ForeignKey("calendar.Quarter", on_delete=models.CASCADE, related_name="+")
    section = models.CharField(max_length=1, choices=SECTIONS)
    attachment_ids = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["position", "quarter", "section"], name="uniq_photo_selection"
            )
        ]
