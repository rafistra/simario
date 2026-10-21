"""Scheduled tasks of holdings (spec 4.8)."""

import datetime as dt

from django.db import transaction

from simario.accounts.services import bump_auth_epoch
from simario.core import scheduler

from .models import PositionDelegate


@scheduler.register("delegations")
@transaction.atomic
def expire_delegations(as_of: dt.datetime) -> None:
    """FR-ADM-010: delegations past their end date are closed as expired; the Operator's
    sessions refresh their holdings (FR-AUT-008)."""
    due = PositionDelegate.objects.filter(
        end_date__lt=as_of.date(), end_reason__isnull=True
    ).select_related("user")
    for delegate in due:
        delegate.end_reason = "expired"
        delegate.save(update_fields=["end_reason"])
        bump_auth_epoch(delegate.user)
