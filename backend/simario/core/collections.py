"""Collection reads for the master-data and administration pages (B2 plan, Task 1): each
collection as a list of rows shaped like frontend/src/domain/types.ts, so pages can swap
useDb for useCollections without rewriting their logic."""

from typing import Any

from django.db.models import QuerySet
from rest_framework import serializers

from simario.accounts.models import User
from simario.calendar.models import FiscalYear, Quarter, QuarterAssessor
from simario.calendar.serializers import QuarterSerializer
from simario.org.models import (
    MonitoringAssignment,
    MonitoringSupport,
    OrgUnit,
    PositionDelegate,
    PositionOccupancy,
    PositionType,
    Role,
    RolePermission,
    UserRole,
)
from simario.org.models import Position as PositionModel
from simario.org.serializers import PositionSerializer
from simario.reference.models import (
    DataUmumForm,
    MitigationTemplate,
    RiskTemplate,
    ScoreBand,
    ScoreBandVersion,
    ScoreOption,
    Stage,
)


def _fk(source: str | None = None) -> serializers.UUIDField:
    if source:
        return serializers.UUIDField(source=source, read_only=True, allow_null=True)
    return serializers.UUIDField(read_only=True, allow_null=True)


class OrgUnitRow(serializers.ModelSerializer[OrgUnit]):
    class Meta:
        model = OrgUnit
        fields = ["id", "code", "name", "active"]


class PositionTypeRow(serializers.ModelSerializer[PositionType]):
    default_role_id = _fk()

    class Meta:
        model = PositionType
        fields = [
            "id",
            "code",
            "name",
            "line",
            "default_role_id",
            "allows_multiple_officials",
            "identity_schema",
            "has_templates",
            "is_builtin",
            "active",
        ]


class UserRow(serializers.ModelSerializer[User]):
    active = serializers.BooleanField(source="is_active", read_only=True)
    org_unit_id = _fk()

    class Meta:
        model = User
        fields = [
            "id",
            "nip",
            "email",
            "full_name",
            "is_local_account",
            "must_change_password",
            "created_via",
            "active",
            "org_unit_id",
        ]


class OccupancyRow(serializers.ModelSerializer[PositionOccupancy]):
    position_id = _fk()
    user_id = _fk()
    decree_file = serializers.CharField(source="decree_object_key", allow_null=True)

    class Meta:
        model = PositionOccupancy
        fields = [
            "id",
            "position_id",
            "user_id",
            "is_filler",
            "start_date",
            "end_date",
            "decree_no",
            "decree_date",
            "decree_file",
        ]


class DelegateRow(serializers.ModelSerializer[PositionDelegate]):
    position_id = _fk()
    user_id = _fk()
    appointed_by_occupancy_id = _fk("appointed_by_id")
    letter_file = serializers.CharField(source="letter_object_key", allow_null=True)

    class Meta:
        model = PositionDelegate
        fields = [
            "id",
            "position_id",
            "user_id",
            "appointed_by_occupancy_id",
            "letter_no",
            "letter_date",
            "letter_file",
            "start_date",
            "end_date",
            "end_reason",
        ]


class RoleRow(serializers.ModelSerializer[Role]):
    class Meta:
        model = Role
        fields = ["id", "code", "name", "is_locked"]


class RolePermissionRow(serializers.ModelSerializer[RolePermission]):
    role_id = _fk()
    permission = serializers.IntegerField(source="permission_id", read_only=True)

    class Meta:
        model = RolePermission
        fields = ["role_id", "permission", "scope"]


class UserRoleRow(serializers.ModelSerializer[UserRole]):
    user_id = _fk()
    role_id = _fk()

    class Meta:
        model = UserRole
        fields = ["user_id", "role_id", "source"]


class SupportRow(serializers.ModelSerializer[MonitoringSupport]):
    position_id = _fk()

    class Meta:
        model = MonitoringSupport
        fields = ["position_id", "domain"]


class AssignmentRow(serializers.ModelSerializer[MonitoringAssignment]):
    target_position_id = _fk()
    lead_position_id = _fk()
    quarter_from_id = _fk()
    quarter_to_id = _fk()
    supports = SupportRow(many=True, read_only=True)

    class Meta:
        model = MonitoringAssignment
        fields = [
            "id",
            "target_position_id",
            "lead_position_id",
            "supports",
            "quarter_from_id",
            "quarter_to_id",
            "decree_no",
        ]


class FiscalYearRow(serializers.ModelSerializer[FiscalYear]):
    class Meta:
        model = FiscalYear
        fields = [
            "year",
            "status",
            "tolerance_days",
            "archive_grace_days",
            "archived_at",
            "archived_by",
        ]


class QuarterAssessorRow(serializers.ModelSerializer[QuarterAssessor]):
    quarter_id = _fk()
    position_id = _fk()
    excluded_by_user_id = _fk("excluded_by_id")

    class Meta:
        model = QuarterAssessor
        fields = [
            "quarter_id",
            "position_id",
            "excluded",
            "exclusion_reason",
            "excluded_by_user_id",
        ]


class StageRow(serializers.ModelSerializer[Stage]):
    position_type_id = _fk()

    class Meta:
        model = Stage
        fields = ["id", "position_type_id", "name", "order", "active"]


class DataUmumFormRow(serializers.ModelSerializer[DataUmumForm]):
    position_type_id = _fk()

    class Meta:
        model = DataUmumForm
        fields = [
            "id",
            "position_type_id",
            "version",
            "fields",
            "objective_enabled",
            "default_objective",
            "active",
            "created_at",
        ]


class RiskTemplateRow(serializers.ModelSerializer[RiskTemplate]):
    position_type_id = _fk()
    stage_id = _fk()

    class Meta:
        model = RiskTemplate
        fields = [
            "id",
            "code",
            "position_type_id",
            "stage_id",
            "risk_type",
            "description",
            "order",
            "active",
            "updated_at",
        ]


class MitigationTemplateRow(serializers.ModelSerializer[MitigationTemplate]):
    risk_template_id = _fk()

    class Meta:
        model = MitigationTemplate
        fields = ["id", "code", "risk_template_id", "description", "order", "active"]


class ScoreBandVersionRow(serializers.ModelSerializer[ScoreBandVersion]):
    class Meta:
        model = ScoreBandVersion
        fields = ["id", "number", "effective_from", "status"]


class ScoreBandRow(serializers.ModelSerializer[ScoreBand]):
    version_id = _fk()
    lower_exclusive = serializers.FloatField(allow_null=True, read_only=True)
    upper_inclusive = serializers.FloatField(read_only=True)

    class Meta:
        model = ScoreBand
        fields = [
            "version_id",
            "lower_exclusive",
            "upper_inclusive",
            "predicate",
            "order",
            "guidance",
        ]


class ScoreOptionRow(serializers.ModelSerializer[ScoreOption]):
    version_id = _fk()
    value = serializers.FloatField(read_only=True)

    class Meta:
        model = ScoreOption
        fields = ["id", "version_id", "value", "label", "order"]


def _qs(model: Any, *order: str) -> QuerySet[Any]:
    queryset: QuerySet[Any] = model.objects.all()
    return queryset.order_by(*order) if order else queryset


# name (prototype DB key) → (queryset factory, row serializer)
COLLECTIONS: dict[str, tuple[Any, type[serializers.BaseSerializer[Any]]]] = {
    "orgUnits": (lambda: _qs(OrgUnit, "code"), OrgUnitRow),
    "positionTypes": (lambda: _qs(PositionType, "line", "code"), PositionTypeRow),
    "positions": (lambda: _qs(PositionModel, "code"), PositionSerializer),
    "users": (lambda: _qs(User, "full_name"), UserRow),
    "occupancies": (lambda: _qs(PositionOccupancy, "start_date"), OccupancyRow),
    "delegates": (lambda: _qs(PositionDelegate, "start_date"), DelegateRow),
    "roles": (lambda: _qs(Role, "code"), RoleRow),
    "rolePermissions": (lambda: _qs(RolePermission, "permission_id"), RolePermissionRow),
    "userRoles": (lambda: _qs(UserRole), UserRoleRow),
    "assignments": (
        lambda: MonitoringAssignment.objects.prefetch_related("supports"),
        AssignmentRow,
    ),
    "fiscalYears": (lambda: _qs(FiscalYear, "year"), FiscalYearRow),
    "quarters": (lambda: _qs(Quarter, "fiscal_year_id", "number"), QuarterSerializer),
    "quarterAssessors": (lambda: _qs(QuarterAssessor), QuarterAssessorRow),
    "stages": (lambda: _qs(Stage, "order"), StageRow),
    "dataUmumForms": (lambda: _qs(DataUmumForm, "version"), DataUmumFormRow),
    "riskTemplates": (lambda: _qs(RiskTemplate, "order"), RiskTemplateRow),
    "mitigationTemplates": (lambda: _qs(MitigationTemplate, "order"), MitigationTemplateRow),
    "scoreBandVersions": (lambda: _qs(ScoreBandVersion, "number"), ScoreBandVersionRow),
    "scoreBands": (lambda: _qs(ScoreBand, "order"), ScoreBandRow),
    "scoreOptions": (lambda: _qs(ScoreOption, "order"), ScoreOptionRow),
}
