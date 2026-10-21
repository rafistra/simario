"""Attachment scanning (NFR-010, spec §4.8): `attachment_scan` runs right after an upload (Celery)
and as a scheduled sweep of anything still pending."""

import datetime as dt
import logging
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from celery import shared_task
from django.db import transaction

from simario.audit.services import record
from simario.core import clock, scheduler
from simario.notifications.services import notify

from . import files
from .models import Attachment

log = logging.getLogger(__name__)


@transaction.atomic
def scan_one(attachment_id: str) -> str:
    """pending → clean | quarantined. Files without content (demo data) are clean. When clamd is
    unreachable the file stays pending for the next sweep."""
    a = (
        Attachment.objects.select_for_update()
        .filter(pk=attachment_id, scan_status="pending")
        .first()
    )
    if a is None:
        return "skipped"
    if not a.object_key:
        a.scan_status = "clean"
        a.save(update_fields=["scan_status"])
        return "clean"
    try:
        clean = files.clamd_scan(files.read(a.object_key))
    except (OSError, BotoCoreError, ClientError):
        log.warning("attachment_scan: clamd unavailable, %s stays pending", a.id)
        return "pending"
    at = clock.now()
    if clean:
        a.scan_status = "clean"
        a.save(update_fields=["scan_status"])
        return "clean"
    a.object_key = files.quarantine(a.object_key)
    a.scan_status = "quarantined"
    a.save(update_fields=["scan_status", "object_key"])
    notify(
        user=a.uploaded_by,
        kind="attachment_quarantined",
        text=f"Lampiran “{a.filename}” dikarantina karena terdeteksi berbahaya.",
        target_url="/notifikasi",
        event_key=f"quarantine:{a.id}",
        at=at,
    )
    record(
        action="karantina_lampiran",
        entity_type="Attachment",
        entity_id=str(a.id),
        acting_as="sistem",
        before={"scanStatus": "pending"},
        after={"scanStatus": "quarantined"},
        at=at,
    )
    return "quarantined"


@shared_task(name="attachment_scan", bind=True, max_retries=5, default_retry_delay=60)
def scan_attachment(self: Any, attachment_id: str) -> str:
    """Retries every minute while clamd or storage is down, then leaves it to the sweep."""
    result = scan_one(attachment_id)
    if result == "pending" and self.request.retries < self.max_retries:
        raise self.retry()
    return result


@scheduler.register("attachment_scan")
def sweep_pending(as_of: dt.datetime) -> None:
    for aid in Attachment.objects.filter(scan_status="pending").values_list("id", flat=True):
        try:
            scan_one(str(aid))
        except Exception:  # one bad file never stops the other scheduled tasks
            log.exception("attachment_scan: %s failed", aid)
