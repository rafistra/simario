"""Quarterly assessment rows (PRD §2.8.1, §2.5). B3 adds RiskQuarter; B5 adds the rest."""

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
