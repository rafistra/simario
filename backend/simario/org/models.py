"""Organisation, positions, holdings and roles (PRD §2.8.1, §1.4). Permission checks use codes
1–26, never role names (RB-ADM-002)."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel

LINES = [(1, "Lini 1"), (2, "Lini 2"), (3, "Lini 3")]
SCOPES = [("sendiri", "sendiri"), ("unit", "unit"), ("semua", "semua")]


class OrgUnit(UUIDModel):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=200)
    active = models.BooleanField(default=True)


class Role(UUIDModel):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=200)
    is_locked = models.BooleanField(default=False)


class Permission(models.Model):
    """Catalogue FR-ADM-002 (codes 1–26)."""

    SCOPE_KINDS = [("scoped", "scoped"), ("own", "own"), ("none", "none")]

    code = models.PositiveSmallIntegerField(primary_key=True)
    group = models.CharField(max_length=32)
    label = models.CharField(max_length=200)
    scope_kind = models.CharField(max_length=8, choices=SCOPE_KINDS)
    requires_official = models.BooleanField()
    is_drafting = models.BooleanField()
    is_content_action = models.BooleanField()


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="permissions")
    permission = models.ForeignKey(Permission, on_delete=models.PROTECT)
    scope = models.CharField(max_length=8, choices=SCOPES, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="uniq_role_permission")
        ]


class PositionType(UUIDModel):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=200)
    line = models.PositiveSmallIntegerField(choices=LINES)
    default_role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="+")
    allows_multiple_officials = models.BooleanField(default=False)
    identity_schema = models.JSONField(default=list)
    has_templates = models.BooleanField(default=False)
    is_builtin = models.BooleanField(default=False)
    active = models.BooleanField(default=True)


class Position(UUIDModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=200)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.PROTECT, related_name="positions")
    position_type = models.ForeignKey(
        PositionType, on_delete=models.PROTECT, related_name="positions"
    )
    identity = models.JSONField(default=dict)
    active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivation_reason = models.TextField(null=True, blank=True)
    # Short label for predicate chips (Lini 3: "KEP", "PAI").
    short_name = models.CharField(max_length=16, null=True, blank=True)

    class Meta:
        constraints = [
            # INV-2
            models.UniqueConstraint(fields=["org_unit", "code"], name="uniq_position_code_unit")
        ]


class PositionOccupancy(UUIDModel):
    """Pejabat holding."""

    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="occupancies")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="occupancies"
    )
    is_filler = models.BooleanField(default=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    decree_no = models.CharField(max_length=200, blank=True)
    decree_date = models.DateField(null=True, blank=True)
    decree_object_key = models.CharField(max_length=500, null=True, blank=True)


class PositionDelegate(UUIDModel):
    """Operator holding."""

    END_REASONS = [
        (reason, reason)
        for reason in (
            "revoked",
            "expired",
            "official_changed",
            "filler_changed",
            "promoted",
            "user_deactivated",
        )
    ]

    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="delegates")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="delegations"
    )
    appointed_by = models.ForeignKey(
        PositionOccupancy, on_delete=models.PROTECT, related_name="delegates"
    )
    letter_no = models.CharField(max_length=200, blank=True)
    letter_date = models.DateField(null=True, blank=True)
    letter_object_key = models.CharField(max_length=500, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    end_reason = models.CharField(max_length=32, choices=END_REASONS, null=True, blank=True)


class UserRole(models.Model):
    SOURCES = [("manual", "manual"), ("position", "position")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_roles"
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="+")
    source = models.CharField(max_length=16, choices=SOURCES)
    source_ref = models.CharField(max_length=64, null=True, blank=True)
