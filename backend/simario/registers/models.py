"""Risk registers (PRD §2.8.1, §5): one per position per fiscal year (INV-1); published wording
never changes (INV-7); items are deactivated, never deleted once published."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel
from simario.reference.models import RISK_TYPES

ITEM_STATUSES = [(s, s) for s in ("draft", "ready", "active", "inactive")]


def _user_fk() -> models.ForeignKey:  # type: ignore[type-arg]
    return models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )


class Register(UUIDModel):
    STATUSES = [(s, s) for s in ("draft", "ready", "published", "archived")]

    position = models.ForeignKey("org.Position", on_delete=models.PROTECT, related_name="registers")
    fiscal_year = models.ForeignKey(
        "calendar.FiscalYear", on_delete=models.PROTECT, related_name="registers"
    )
    status = models.CharField(max_length=16, choices=STATUSES, default="draft")
    # {tujuan, kegiatan[], besar_anggaran, target, extra{key: value}}
    data_umum = models.JSONField(default=dict)
    data_umum_form = models.ForeignKey(
        "reference.DataUmumForm", on_delete=models.PROTECT, related_name="+"
    )
    copied_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = _user_fk()
    updated_at = models.DateTimeField(null=True, blank=True)
    updated_by = _user_fk()
    ready_at = models.DateTimeField(null=True, blank=True)
    ready_by = _user_fk()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["position", "fiscal_year"], name="uniq_register_year")
        ]


class RegisterStageDeclaration(UUIDModel):
    KINDS = [("stage_not_relevant", "stage_not_relevant"), ("no_risk_in_type", "no_risk_in_type")]

    register = models.ForeignKey(Register, on_delete=models.CASCADE, related_name="declarations")
    stage = models.ForeignKey("reference.Stage", on_delete=models.PROTECT, related_name="+")
    # null = the whole stage is not relevant.
    risk_type = models.CharField(max_length=24, choices=RISK_TYPES, null=True, blank=True)
    kind = models.CharField(max_length=24, choices=KINDS)
    reason = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["register", "stage", "risk_type"],
                nulls_distinct=False,
                name="uniq_register_declaration",
            )
        ]


class RegisterRisk(UUIDModel):
    register = models.ForeignKey(Register, on_delete=models.CASCADE, related_name="risks")
    stage = models.ForeignKey("reference.Stage", on_delete=models.PROTECT, related_name="+")
    risk_type = models.CharField(max_length=24, choices=RISK_TYPES)
    risk_template = models.ForeignKey(
        "reference.RiskTemplate",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="register_risks",
    )
    description_snapshot = models.TextField()
    is_custom = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=ITEM_STATUSES, default="draft")
    published_at = models.DateTimeField(null=True, blank=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_from_quarter = models.ForeignKey(
        "calendar.Quarter", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    deactivation_reason = models.TextField(null=True, blank=True)
    previous_year_risk = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    lineage_id = models.CharField(max_length=80)
    flags = models.JSONField(default=list)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = _user_fk()
    ready_at = models.DateTimeField(null=True, blank=True)
    # PRD §2.8.1 columns kept for later use (spec §4.2: nullable).
    impact = models.PositiveSmallIntegerField(null=True, blank=True)
    likelihood = models.PositiveSmallIntegerField(null=True, blank=True)
    score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)


class RegisterMitigation(UUIDModel):
    register_risk = models.ForeignKey(
        RegisterRisk, on_delete=models.CASCADE, related_name="mitigations"
    )
    # Editing a template recreates its mitigation templates; the snapshot keeps the wording.
    mitigation_template = models.ForeignKey(
        "reference.MitigationTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    description_snapshot = models.TextField()
    is_custom = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, choices=ITEM_STATUSES, default="draft")
    deactivation_reason = models.TextField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    created_by = _user_fk()
    ready_at = models.DateTimeField(null=True, blank=True)
