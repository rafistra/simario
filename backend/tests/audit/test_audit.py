import pytest
from django.db import DatabaseError, transaction

from simario.audit.models import AuditLog
from simario.audit.services import record

pytestmark = pytest.mark.django_db


def test_record_writes_row() -> None:
    row = record(action="ganti_kata_sandi", entity_type="User", entity_id="u-1")
    assert AuditLog.objects.get(pk=row.pk).action == "ganti_kata_sandi"
    assert row.at is not None


def test_audit_update_is_rejected() -> None:
    row = record(action="x", entity_type="User", entity_id="u-1")
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditLog.objects.filter(pk=row.pk).update(action="changed")


def test_audit_delete_is_rejected() -> None:
    row = record(action="x", entity_type="User", entity_id="u-1")
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditLog.objects.filter(pk=row.pk).delete()
