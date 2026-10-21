"""Position types and positions (FR-MST-008, 009). Ports masterApi in
frontend/src/data/api/master.ts: same checks, error copy, audit actions and notifications."""

import uuid
from typing import Any

from django.db import transaction

from simario.accounts.services import bump_auth_epoch
from simario.audit.services import record
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.notifications.services import notify
from simario.registers import usage

from .models import Position, PositionDelegate, PositionType


def _audit(
    actor: Actor, action: str, entity_type: str, entity_id: Any, before: Any, after: Any
) -> None:
    record(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        actor=actor.user,
        acting_as=actor.acting_as,
        before=before,
        after=after,
        at=actor.at,
    )


def _norm(s: str) -> str:
    return " ".join(s.split()).lower()


def end_delegate(delegate: PositionDelegate, reason: str, today: Any) -> None:
    """Ends an Operator holding and the Operator's sessions (FR-AUT-008)."""
    delegate.end_date = today
    delegate.end_reason = reason
    delegate.save(update_fields=["end_date", "end_reason"])
    bump_auth_epoch(delegate.user)


@transaction.atomic
def set_position_type_active(actor: Actor, type_id: uuid.UUID, active: bool) -> None:
    ptype = PositionType.objects.select_for_update().get(pk=type_id)
    if not active:
        in_use = list(Position.objects.filter(position_type=ptype, active=True).order_by("code"))
        if in_use:
            raise ApiError(
                "type_in_use",
                f"Jenis “{ptype.name}” masih dipakai",
                {
                    "positions": [str(p.id) for p in in_use],
                    "running_registers": usage.running_registers_of_positions(
                        [p.id for p in in_use]
                    ),
                },
            )
    ptype.active = active
    ptype.save(update_fields=["active"])
    _audit(
        actor,
        "aktifkan_jenis_jabatan" if active else "nonaktifkan_jenis_jabatan",
        "PositionType",
        type_id,
        {"active": not active},
        {"active": active},
    )


def _validate_position(data: dict[str, Any], position_id: uuid.UUID | None) -> None:
    errors: dict[str, str] = {}
    if not data.get("position_type_id"):
        errors["position_type_id"] = "Jenis jabatan wajib dipilih."
    code = (data.get("code") or "").strip()
    if not code:
        errors["code"] = "Kode jabatan wajib diisi."
    else:
        same_unit = Position.objects.filter(org_unit_id=data.get("org_unit_id"))
        if position_id:
            same_unit = same_unit.exclude(pk=position_id)
        if any(_norm(p.code) == _norm(code) for p in same_unit):
            errors["code"] = "Kode jabatan sudah dipakai."
    if not (data.get("name") or "").strip():
        errors["name"] = "Nama jabatan wajib diisi."
    if not data.get("org_unit_id"):
        errors["org_unit_id"] = "Unit kerja wajib dipilih."
    if errors:
        raise ApiError("validation", "Periksa kembali isian jabatan.", errors)


@transaction.atomic
def save_position(
    actor: Actor, data: dict[str, Any], position_id: uuid.UUID | None = None
) -> uuid.UUID:
    _validate_position(data, position_id)
    fields = {
        "position_type_id": data["position_type_id"],
        "code": data["code"].strip(),
        "name": data["name"].strip(),
        "org_unit_id": data["org_unit_id"],
        "identity": data.get("identity") or {},
    }
    after = {
        **fields,
        "position_type_id": str(fields["position_type_id"]),
        "org_unit_id": str(fields["org_unit_id"]),
    }
    if position_id:
        pos = Position.objects.select_for_update().get(pk=position_id)
        before = {
            "code": pos.code,
            "name": pos.name,
            "org_unit_id": str(pos.org_unit_id),
            "identity": pos.identity,
        }
        for k, v in fields.items():
            setattr(pos, k, v)
        pos.save()
        _audit(actor, "ubah_jabatan", "Position", pos.id, before, after)
        return pos.id
    pos = Position.objects.create(**fields, active=True)
    _audit(actor, "tambah_jabatan", "Position", pos.id, None, after)
    return pos.id


def position_impact(position_id: uuid.UUID, today: Any) -> dict[str, Any]:
    """What deactivating the position affects (FR-MST-009 dialog)."""
    active_operators = (
        PositionDelegate.objects.filter(position_id=position_id, start_date__lte=today)
        .exclude(end_date__lt=today)
        .count()
    )
    return {
        "published_registers": usage.published_registers(position_id),
        "active_operators": active_operators,
    }


@transaction.atomic
def deactivate_position(actor: Actor, position_id: uuid.UUID, reason: str) -> None:
    if not reason.strip():
        raise ApiError("validation", "Alasan penonaktifan wajib diisi.")
    pos = Position.objects.select_for_update().get(pk=position_id)
    pos.active = False
    pos.deactivated_at = actor.at
    pos.deactivation_reason = reason.strip()
    pos.save(update_fields=["active", "deactivated_at", "deactivation_reason"])
    # Operators of a deactivated position end; Pejabat holdings stay for history.
    for delegate in PositionDelegate.objects.filter(position=pos, end_date=None).select_related(
        "user"
    ):
        end_delegate(delegate, "revoked", actor.today)
        notify(
            user=delegate.user,
            kind="operator_revoked",
            text=f"Penunjukan Anda sebagai operator untuk {pos.name} berakhir",
            target_url="/jabatan-saya",
            event_key=f"pos-deactivated:{pos.id}:{delegate.id}",
            at=actor.at,
        )
    _audit(
        actor,
        "nonaktifkan_jabatan",
        "Position",
        pos.id,
        {"active": True},
        {"active": False, "reason": reason.strip()},
    )


@transaction.atomic
def reactivate_position(actor: Actor, position_id: uuid.UUID) -> None:
    pos = Position.objects.select_for_update().get(pk=position_id)
    pos.active = True
    pos.deactivated_at = None
    pos.deactivation_reason = None
    pos.save(update_fields=["active", "deactivated_at", "deactivation_reason"])
    _audit(actor, "aktifkan_jabatan", "Position", pos.id, {"active": False}, {"active": True})
