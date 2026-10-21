"""Rows shaped like Comment, Attachment, RiskQuarter, Assessment, ComparisonResult in
frontend/src/domain/types.ts (snake_case here; camelCase on the wire)."""

from typing import Any

from rest_framework import serializers

from simario.assessments.models import Assessment, ComparisonResult, RiskQuarter

from .models import Attachment, Comment, ThreadSubscription, ThreadView


def _fk(source: str | None = None) -> serializers.UUIDField:
    if source:
        return serializers.UUIDField(source=source, read_only=True, allow_null=True)
    return serializers.UUIDField(read_only=True, allow_null=True)


class CommentRow(serializers.ModelSerializer[Comment]):
    register_risk_id = _fk()
    register_mitigation_id = _fk()
    author_user_id = _fk("author_id")
    acting_position_id = _fk()
    quarter_id = _fk()
    withdrawn_by_user_id = _fk("withdrawn_by_id")
    mention_user_ids = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "register_risk_id",
            "register_mitigation_id",
            "author_user_id",
            "author_line",
            "acting_as",
            "acting_position_id",
            "quarter_id",
            "body",
            "is_step",
            "created_at",
            "edited_at",
            "withdrawn_at",
            "withdrawn_by_user_id",
            "mention_user_ids",
        ]

    def get_mention_user_ids(self, obj: Comment) -> list[str]:
        return [str(m.user_id) for m in obj.mentions.all()]


class AttachmentRow(serializers.ModelSerializer[Attachment]):
    owner_id = serializers.UUIDField(read_only=True)
    size_bytes = serializers.IntegerField(source="size", read_only=True)
    uploaded_by_id = _fk()

    class Meta:
        model = Attachment
        fields = [
            "id",
            "owner_kind",
            "owner_id",
            "filename",
            "size_bytes",
            "mime_type",
            "scan_status",
            "is_confidential",
            "uploaded_by_id",
            "uploaded_at",
        ]


class SubscriptionRow(serializers.ModelSerializer[ThreadSubscription]):
    user_id = _fk()
    register_risk_id = _fk()

    class Meta:
        model = ThreadSubscription
        fields = ["user_id", "register_risk_id", "muted"]


class ThreadViewRow(serializers.ModelSerializer[ThreadView]):
    user_id = _fk()
    register_risk_id = _fk()

    class Meta:
        model = ThreadView
        fields = ["user_id", "register_risk_id", "last_seen_at"]


class RiskQuarterRow(serializers.ModelSerializer[RiskQuarter]):
    register_risk_id = _fk()
    quarter_id = _fk()

    class Meta:
        model = RiskQuarter
        fields = [
            "id",
            "register_risk_id",
            "quarter_id",
            "comparison_status",
            "first_opened_at",
            "recurring",
        ]


class AssessmentRow(serializers.ModelSerializer[Assessment]):
    risk_quarter_id = _fk()
    assessor_position_id = _fk()
    score_band_version_id = _fk()
    finalised_by_user_id = _fk("finalised_by_id")
    score = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id",
            "risk_quarter_id",
            "assessor_position_id",
            "assessor_line",
            "status",
            "score",
            "predicate",
            "not_relevant",
            "not_relevant_reason",
            "note",
            "score_band_version_id",
            "finalised_by_user_id",
            "finalised_at",
            "lateness",
            "flags",
            "updated_at",
        ]

    def get_score(self, obj: Assessment) -> float | None:
        return None if obj.score is None else float(obj.score)


class ResultRow(serializers.ModelSerializer[ComparisonResult]):
    risk_quarter_id = _fk()
    lini3_position_id = _fk()
    explanation_sent_by_user_id = _fk("explanation_sent_by_id")

    class Meta:
        model = ComparisonResult
        fields = [
            "id",
            "risk_quarter_id",
            "lini3_position_id",
            "opened_at",
            "result",
            "lini1_higher",
            "explanation_required",
            "explanation_status",
            "explanation_due_on",
            "explanation_reason",
            "explanation_plan",
            "explanation_sent_at",
            "explanation_sent_by_user_id",
            "explanation_lateness",
        ]


def rows(serializer: Any, qs: Any) -> list[dict[str, Any]]:
    return [dict(r) for r in serializer(qs, many=True).data]
