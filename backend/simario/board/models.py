"""Risk threads and attachments (PRD §2.8.1, §6). Nothing is deleted (RB-PPN-003): comments are
withdrawn."""

from django.conf import settings
from django.db import models

from simario.core.models import UUIDModel

LINES = [(1, 1), (2, 2), (3, 3)]
CAPACITIES = [("pejabat", "pejabat"), ("operator", "operator")]


class Comment(UUIDModel):
    register_risk = models.ForeignKey(
        "registers.RegisterRisk", on_delete=models.PROTECT, related_name="comments"
    )
    register_mitigation = models.ForeignKey(
        "registers.RegisterMitigation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="comments",
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    author_line = models.PositiveSmallIntegerField(choices=LINES)
    acting_as = models.CharField(max_length=16, choices=CAPACITIES)
    acting_position = models.ForeignKey("org.Position", on_delete=models.PROTECT, related_name="+")
    quarter = models.ForeignKey("calendar.Quarter", on_delete=models.PROTECT, related_name="+")
    body = models.TextField(blank=True)
    is_step = models.BooleanField(default=False)
    created_at = models.DateTimeField()
    edited_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    withdrawn_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )


class Mention(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="mentions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["comment", "user"], name="uniq_mention")]


class ThreadSubscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    register_risk = models.ForeignKey(
        "registers.RegisterRisk", on_delete=models.CASCADE, related_name="subscriptions"
    )
    muted = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "register_risk"], name="uniq_subscription")
        ]


class ThreadView(models.Model):
    """When a user last opened a thread (unseen-activity dots, FR-PPN-001)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    register_risk = models.ForeignKey(
        "registers.RegisterRisk", on_delete=models.CASCADE, related_name="+"
    )
    last_seen_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "register_risk"], name="uniq_thread_view")
        ]


class Attachment(UUIDModel):
    OWNER_KINDS = [("comment", "comment"), ("assessment", "assessment")]

    owner_kind = models.CharField(max_length=16, choices=OWNER_KINDS)
    owner_id = models.UUIDField(db_index=True)
    filename = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    mime_type = models.CharField(max_length=120)
    is_confidential = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    uploaded_at = models.DateTimeField()
    # Null for demo files without content (the download serves a sample file).
    object_key = models.CharField(max_length=300, null=True, blank=True)
