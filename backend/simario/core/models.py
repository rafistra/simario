import uuid

from django.db import models


class UUIDModel(models.Model):
    """Server-generated UUID primary key (spec §4.2)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True
