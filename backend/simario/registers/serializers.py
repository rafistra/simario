"""Rows shaped like Register, RegisterRisk, RegisterMitigation in frontend/src/domain/types.ts.
DateTimeFields render in WITA with offset, so `published_at[:10]` is the local day for the rules."""

from typing import Any

from rest_framework import serializers

from .models import Register, RegisterMitigation, RegisterRisk, RegisterStageDeclaration


def _fk(source: str | None = None) -> serializers.UUIDField:
    if source:
        return serializers.UUIDField(source=source, read_only=True, allow_null=True)
    return serializers.UUIDField(read_only=True, allow_null=True)


class RegisterRow(serializers.ModelSerializer[Register]):
    position_id = _fk()
    fiscal_year = serializers.IntegerField(source="fiscal_year_id", read_only=True)
    data_umum_form_id = _fk()
    copied_from_register_id = _fk("copied_from_id")
    published_by_user_id = _fk("published_by_id")
    updated_by_user_id = _fk("updated_by_id")
    ready_by_user_id = _fk("ready_by_id")
    data_umum = serializers.SerializerMethodField()

    class Meta:
        model = Register
        fields = [
            "id",
            "position_id",
            "fiscal_year",
            "status",
            "data_umum",
            "data_umum_form_id",
            "copied_from_register_id",
            "published_at",
            "published_by_user_id",
            "updated_at",
            "updated_by_user_id",
            "ready_at",
            "ready_by_user_id",
        ]

    def get_data_umum(self, obj: Register) -> dict[str, Any]:
        du = obj.data_umum or {}
        return {
            "tujuan": du.get("tujuan", ""),
            "kegiatan": du.get("kegiatan", []),
            "besar_anggaran": du.get("besar_anggaran"),
            "target": du.get("target", ""),
            "extra": du.get("extra", {}),
        }


class DeclarationRow(serializers.ModelSerializer[RegisterStageDeclaration]):
    register_id = _fk()
    stage_id = _fk()

    class Meta:
        model = RegisterStageDeclaration
        fields = ["id", "register_id", "stage_id", "risk_type", "kind", "reason"]


class RiskRow(serializers.ModelSerializer[RegisterRisk]):
    register_id = _fk()
    stage_id = _fk()
    risk_template_id = _fk()
    deactivated_from_quarter_id = _fk()
    previous_year_risk_id = _fk()
    created_by_user_id = _fk("created_by_id")

    class Meta:
        model = RegisterRisk
        fields = [
            "id",
            "register_id",
            "stage_id",
            "risk_type",
            "risk_template_id",
            "description_snapshot",
            "is_custom",
            "status",
            "published_at",
            "deactivated_at",
            "deactivated_from_quarter_id",
            "deactivation_reason",
            "previous_year_risk_id",
            "lineage_id",
            "flags",
            "order",
            "created_at",
            "created_by_user_id",
            "ready_at",
        ]


class MitigationRow(serializers.ModelSerializer[RegisterMitigation]):
    register_risk_id = _fk()
    mitigation_template_id = _fk()
    created_by_user_id = _fk("created_by_id")

    class Meta:
        model = RegisterMitigation
        fields = [
            "id",
            "register_risk_id",
            "mitigation_template_id",
            "description_snapshot",
            "is_custom",
            "order",
            "status",
            "deactivation_reason",
            "published_at",
            "created_at",
            "created_by_user_id",
            "ready_at",
        ]
