from rest_framework import serializers

from .models import Quarter


class QuarterSerializer(serializers.ModelSerializer[Quarter]):
    """Shape of `Quarter` in frontend/src/domain/types.ts."""

    fiscal_year = serializers.IntegerField(source="fiscal_year_id", read_only=True)
    score_band_version_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Quarter
        fields = [
            "id",
            "fiscal_year",
            "number",
            "starts_on",
            "ends_on",
            "lini1_opens_on",
            "lini1_deadline",
            "lini3_opens_on",
            "lini3_deadline",
            "explanation_workdays",
            "score_band_version_id",
        ]
