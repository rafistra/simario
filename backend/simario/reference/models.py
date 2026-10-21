"""Reference data (PRD §2.8.1, FR-MST): stages and templates from the Rapim deck, Data Umum
forms, score bands and the statements assessors choose (PRD v2.8)."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from simario.core.models import UUIDModel

RISK_TYPES = [
    ("kinerja_anggaran", "kinerja_anggaran"),
    ("ketidakpatuhan", "ketidakpatuhan"),
    ("kecurangan", "kecurangan"),
]
PREDICATES = [("kurang", "kurang"), ("cukup", "cukup"), ("terkendali", "terkendali")]


class Stage(UUIDModel):
    position_type = models.ForeignKey(
        "org.PositionType", on_delete=models.PROTECT, related_name="stages"
    )
    # Stage code from docs/seed/template_risiko_rapim.json; null for stages added in the app.
    code = models.CharField(max_length=32, null=True, blank=True, unique=True)
    name = models.CharField(max_length=200)
    order = models.PositiveSmallIntegerField()
    active = models.BooleanField(default=True)


class DataUmumForm(UUIDModel):
    position_type = models.ForeignKey(
        "org.PositionType", on_delete=models.PROTECT, related_name="data_umum_forms"
    )
    version = models.PositiveSmallIntegerField()
    fields = models.JSONField(default=list)
    # "Tujuan" is optional and off unless enabled per form version (user decision, differs
    # from the PRD).
    objective_enabled = models.BooleanField(default=False)
    default_objective = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["position_type", "version"], name="uniq_data_umum_form_version"
            )
        ]


class RiskTemplate(UUIDModel):
    code = models.CharField(max_length=32, unique=True)
    position_type = models.ForeignKey(
        "org.PositionType", on_delete=models.PROTECT, related_name="risk_templates"
    )
    stage = models.ForeignKey(Stage, on_delete=models.PROTECT, related_name="risk_templates")
    risk_type = models.CharField(max_length=24, choices=RISK_TYPES)
    description = models.TextField()
    order = models.PositiveSmallIntegerField()
    active = models.BooleanField(default=True)
    updated_at = models.DateField(null=True, blank=True)


class MitigationTemplate(UUIDModel):
    code = models.CharField(max_length=40, unique=True)
    risk_template = models.ForeignKey(
        RiskTemplate, on_delete=models.CASCADE, related_name="mitigations"
    )
    description = models.TextField()
    order = models.PositiveSmallIntegerField()
    active = models.BooleanField(default=True)


class ScoreBandVersion(UUIDModel):
    STATUSES = [
        ("draft", "draft"),
        ("scheduled", "scheduled"),
        ("active", "active"),
        ("retired", "retired"),
    ]

    number = models.PositiveSmallIntegerField(unique=True)
    effective_from = models.DateField()
    status = models.CharField(max_length=16, choices=STATUSES, default="draft")

    class Meta:
        constraints = [
            # INV-3: exactly one active version.
            models.UniqueConstraint(
                fields=["status"], condition=Q(status="active"), name="uniq_active_band_version"
            ),
            # At most one draft at a time (two managers starting a draft together).
            models.UniqueConstraint(
                fields=["status"], condition=Q(status="draft"), name="uniq_draft_band_version"
            ),
        ]


class ScoreBand(models.Model):
    version = models.ForeignKey(ScoreBandVersion, on_delete=models.CASCADE, related_name="bands")
    # null = 0 is included (closed lower bound of the first band).
    lower_exclusive = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    upper_inclusive = models.DecimalField(max_digits=2, decimal_places=1)
    predicate = models.CharField(max_length=16, choices=PREDICATES)
    order = models.PositiveSmallIntegerField()
    guidance = models.TextField(blank=True)


class ScoreOption(UUIDModel):
    version = models.ForeignKey(ScoreBandVersion, on_delete=models.CASCADE, related_name="options")
    value = models.DecimalField(max_digits=2, decimal_places=1)
    label = models.TextField()
    order = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["version", "value"], name="uniq_option_value"),
            models.UniqueConstraint(fields=["version", "label"], name="uniq_option_label"),
        ]


class RiskProposal(UUIDModel):
    """A custom risk offered as a template when its register is published (FR-MST-005)."""

    STATUSES = [(s, s) for s in ("pending", "accepted", "rejected")]

    source_register_risk = models.ForeignKey(
        "registers.RegisterRisk", on_delete=models.PROTECT, related_name="proposals"
    )
    description = models.TextField()
    proposer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=16, choices=STATUSES, default="pending")
    rejection_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField()
