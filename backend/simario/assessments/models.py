"""Quarterly assessment rows (PRD §2.8.1, §2.5). RiskQuarter (B3); Assessment and ComparisonResult
hold demo data from B4 for the board panel; B5 adds their behaviour."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel


class RiskQuarter(UUIDModel):
    STATUSES = [(s, s) for s in ("waiting", "partial", "open")]

    register_risk = models.ForeignKey(
        "registers.RegisterRisk", on_delete=models.CASCADE, related_name="quarters"
    )
    quarter = models.ForeignKey("calendar.Quarter", on_delete=models.PROTECT, related_name="+")
    comparison_status = models.CharField(max_length=16, choices=STATUSES, default="waiting")
    first_opened_at = models.DateTimeField(null=True, blank=True)
    recurring = models.BooleanField(default=False)
    no_step_flag = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["register_risk", "quarter"], name="uniq_risk_quarter")
        ]


class Assessment(UUIDModel):
    """One assessor's assessment of a risk in a quarter (Lini 1 or a Lini 3 directorate)."""

    STATUSES = [(s, s) for s in ("draft", "ready", "final", "not_assessed")]
    LATENESS = [("terlambat", "terlambat"), ("sangat_terlambat", "sangat_terlambat")]

    risk_quarter = models.ForeignKey(
        RiskQuarter, on_delete=models.CASCADE, related_name="assessments"
    )
    assessor_position = models.ForeignKey(
        "org.Position", on_delete=models.PROTECT, related_name="+"
    )
    assessor_line = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=16, choices=STATUSES, default="draft")
    score = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    predicate = models.CharField(max_length=16, null=True, blank=True)
    not_relevant = models.BooleanField(default=False)
    not_relevant_reason = models.TextField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    score_band_version = models.ForeignKey(
        "reference.ScoreBandVersion",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    finalised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    finalised_at = models.DateTimeField(null=True, blank=True)
    lateness = models.CharField(max_length=24, choices=LATENESS, null=True, blank=True)
    flags = models.JSONField(default=list)
    updated_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["risk_quarter", "assessor_position"], name="uniq_assessment"
            )
        ]


class ComparisonResult(UUIDModel):
    """Lini 1 vs one Lini 3 directorate for a risk-quarter, opened per directorate (§2.5)."""

    RESULTS = [(s, s) for s in ("sesuai", "tidak_sesuai", "incomparable")]
    EXPLANATION = [
        (s, s) for s in ("not_required", "optional", "pending", "ready", "sent", "not_sent")
    ]

    risk_quarter = models.ForeignKey(RiskQuarter, on_delete=models.CASCADE, related_name="results")
    lini3_position = models.ForeignKey("org.Position", on_delete=models.PROTECT, related_name="+")
    opened_at = models.DateTimeField()
    result = models.CharField(max_length=16, choices=RESULTS)
    lini1_higher = models.BooleanField(default=False)
    explanation_required = models.BooleanField(default=False)
    explanation_status = models.CharField(
        max_length=16, choices=EXPLANATION, default="not_required"
    )
    explanation_due_on = models.DateField(null=True, blank=True)
    explanation_reason = models.TextField(null=True, blank=True)
    explanation_plan = models.TextField(null=True, blank=True)
    explanation_sent_at = models.DateTimeField(null=True, blank=True)
    explanation_sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    explanation_lateness = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["risk_quarter", "lini3_position"], name="uniq_result")
        ]
