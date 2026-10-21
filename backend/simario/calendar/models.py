"""Fiscal years, quarters and Lini 3 assessor sets (PRD §2.5, §2.8.1)."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class FiscalYear(models.Model):
    STATUSES = [("open", "open"), ("closing", "closing"), ("archived", "archived")]
    ARCHIVED_BY = [("hard_limit", "hard_limit"), ("manual", "manual")]

    year = models.PositiveSmallIntegerField(primary_key=True)
    status = models.CharField(max_length=16, choices=STATUSES, default="open")
    tolerance_days = models.PositiveSmallIntegerField(default=7)
    archive_grace_days = models.PositiveSmallIntegerField(default=30)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.CharField(max_length=16, choices=ARCHIVED_BY, null=True, blank=True)


class Quarter(UUIDModel):
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.PROTECT, related_name="quarters")
    number = models.PositiveSmallIntegerField()
    starts_on = models.DateField()
    ends_on = models.DateField()
    lini1_opens_on = models.DateField()
    lini1_deadline = models.DateField()
    lini3_opens_on = models.DateField()
    lini3_deadline = models.DateField()
    explanation_workdays = models.PositiveSmallIntegerField(default=5)
    score_band_version = models.ForeignKey(
        "reference.ScoreBandVersion",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="quarters",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["fiscal_year", "number"], name="uniq_quarter_number")
        ]


class QuarterAssessor(models.Model):
    quarter = models.ForeignKey(Quarter, on_delete=models.CASCADE, related_name="assessors")
    position = models.ForeignKey("org.Position", on_delete=models.PROTECT, related_name="+")
    excluded = models.BooleanField(default=False)
    exclusion_reason = models.TextField(null=True, blank=True)
    excluded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["quarter", "position"], name="uniq_quarter_assessor")
        ]
