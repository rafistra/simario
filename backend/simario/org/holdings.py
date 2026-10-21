"""Pejabat holdings and Operators (FR-ADM-005, 010, INV-11/13). Ports assignPosition,
replaceOfficial, moveFiller, appointOperator and revokeOperator in
frontend/src/data/api/admin.ts: same checks, error copy, audit actions and notifications."""

import datetime as dt
import uuid
from typing import Any

from django.db import transaction
from django.db.models import Q

from simario.accounts import keycloak
from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.accounts.services import bump_auth_epoch
from simario.audit.services import record, record_by
from simario.core import clock
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.domain import access
from simario.notifications.services import notify

from .models import Permission, Position, PositionDelegate, PositionOccupancy
from .services import end_delegations


def active_on(day: dt.date) -> Q:
    return Q(start_date__lte=day) & (Q(end_date__isnull=True) | Q(end_date__gte=day))


def _day(value: str | dt.date) -> dt.date:
    return value if isinstance(value, dt.date) else dt.date.fromisoformat(value)


def _delegates(day: dt.date, **filters: Any) -> Any:
    return PositionDelegate.objects.filter(active_on(day), **filters).select_related(
        "user", "position"
    )


def apply_assignment(actor: Actor, data: dict[str, Any]) -> dict[str, Any]:
    """Core appointment, shared with the bulk import (FR-ADM-013); call inside a transaction."""
    today = _day(actor.today)
    start = _day(data["start_date"])
    if start > today:
        raise ApiError("validation", "Tanggal mulai tidak boleh di masa depan.")
    if not (data.get("decree_no") or "").strip() or not data.get("decree_date"):
        raise ApiError("validation", "Nomor dan tanggal SK wajib diisi.")
    user = User.objects.filter(pk=data["user_id"]).first()
    if user is None or not user.is_active:
        raise ApiError("validation", "Pengguna tidak aktif.")
    # Lock the position so two appointments to a single-Pejabat position cannot both pass.
    position = (
        Position.objects.select_for_update()
        .select_related("position_type")
        .get(pk=data["position_id"])
    )
    current = list(PositionOccupancy.objects.filter(active_on(today), position=position))
    if any(o.user_id == user.id for o in current):
        raise ApiError("validation", f"{user.full_name} sudah menjadi Pejabat {position.name}.")
    multi = position.position_type.allows_multiple_officials
    if not multi and current:
        raise ApiError("occupied", "Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat.")
    promoted = end_delegations(
        _delegates(today, user=user, position=position), "promoted", actor
    )  # INV-13
    filler = not multi or bool(data.get("is_filler")) or not current
    filler_changed = 0
    if multi and filler:
        for occ in (o for o in current if o.is_filler):
            filler_changed += end_delegations(
                _delegates(today, appointed_by=occ), "filler_changed", actor
            )
            occ.is_filler = False
            occ.save(update_fields=["is_filler"])
            bump_auth_epoch(occ.user)
    occ = PositionOccupancy.objects.create(
        position=position,
        user=user,
        is_filler=filler,
        start_date=start,
        decree_no=data["decree_no"].strip(),
        decree_date=data["decree_date"],
        decree_object_key=data.get("decree_file"),
    )
    bump_auth_epoch(user)
    record_by(
        actor,
        "tetapkan_jabatan",
        "PositionOccupancy",
        occ.id,
        None,
        {
            "user": str(user.id),
            "position": str(position.id),
            "isFiller": filler,
            "promoted": promoted,
            "fillerChanged": filler_changed,
        },
    )
    return {"occupancy_id": occ.id, "promoted": promoted, "filler_changed": filler_changed}


@transaction.atomic
def assign_position(actor: Actor, data: dict[str, Any]) -> dict[str, Any]:
    return apply_assignment(actor, data)


@transaction.atomic
def replace_official(actor: Actor, position_id: uuid.UUID, data: dict[str, Any]) -> dict[str, int]:
    """FR-ADM-005: closes the old occupancy and opens the new one atomically. Nothing moves."""
    today = _day(actor.today)
    effective = _day(data["effective_date"])
    if effective > today:
        raise ApiError("validation", "Tanggal efektif tidak boleh melewati hari ini.")
    if not (data.get("decree_no") or "").strip() or not data.get("decree_date"):
        raise ApiError("validation", "Nomor dan tanggal SK wajib diisi.")
    position = Position.objects.select_for_update().get(pk=position_id)
    out = (
        PositionOccupancy.objects.filter(
            active_on(today), pk=data["outgoing_occupancy_id"], position=position
        )
        .select_related("user")
        .first()
    )
    if out is None:
        raise ApiError("validation", "Pejabat keluar tidak ditemukan.")
    incoming_id = data["incoming_user_id"]
    if str(out.user_id) == str(incoming_id):
        raise ApiError("validation", "Pejabat masuk sama dengan Pejabat keluar.")
    if PositionOccupancy.objects.filter(
        active_on(today), position=position, user_id=incoming_id
    ).exists():
        raise ApiError("validation", "Pengguna ini sudah menjadi Pejabat jabatan ini.")
    incoming = User.objects.get(pk=incoming_id)
    operators_ended = end_delegations(
        _delegates(today, appointed_by=out), "official_changed", actor
    )
    promoted = end_delegations(
        _delegates(today, user=incoming, position=position), "promoted", actor
    )
    out.end_date = max(out.start_date, effective - dt.timedelta(days=1))
    out.save(update_fields=["end_date"])
    occ = PositionOccupancy.objects.create(
        position=position,
        user=incoming,
        is_filler=out.is_filler,
        start_date=effective,
        decree_no=data["decree_no"].strip(),
        decree_date=data["decree_date"],
        decree_object_key=data.get("decree_file"),
    )
    bump_auth_epoch(out.user)
    bump_auth_epoch(incoming)
    record_by(
        actor,
        "alih_pejabat",
        "Position",
        position.id,
        {"occupancy": str(out.id), "user": str(out.user_id)},
        {
            "occupancy": str(occ.id),
            "user": str(incoming.id),
            "effectiveDate": effective.isoformat(),
            "operatorsEnded": operators_ended,
            "promoted": promoted,
        },
    )
    return {"operators_ended": operators_ended, "promoted": promoted}


@transaction.atomic
def move_filler(actor: Actor, position_id: uuid.UUID, to_occupancy_id: uuid.UUID) -> int:
    """Pokja: move the Pengisi mark; Operators appointed by the previous Pengisi end."""
    today = _day(actor.today)
    position = Position.objects.select_for_update().get(pk=position_id)
    current = list(
        PositionOccupancy.objects.filter(active_on(today), position=position).select_related("user")
    )
    to = next((o for o in current if str(o.id) == str(to_occupancy_id)), None)
    if to is None:
        raise ApiError("validation", "Anggota tidak ditemukan.")
    ended = 0
    for occ in (o for o in current if o.is_filler and o.id != to.id):
        ended += end_delegations(_delegates(today, appointed_by=occ), "filler_changed", actor)
        occ.is_filler = False
        occ.save(update_fields=["is_filler"])
        bump_auth_epoch(occ.user)
    to.is_filler = True
    to.save(update_fields=["is_filler"])
    bump_auth_epoch(to.user)
    record_by(
        actor,
        "pindah_pengisi",
        "Position",
        position.id,
        None,
        {"occupancy": str(to.id), "operatorsEnded": ended},
    )
    return ended


def _permission_rows() -> list[dict[str, Any]]:
    return [dict(p) for p in Permission.objects.values("code", "requires_official", "is_drafting")]


def _manage_holding(user: User, position_id: str, refusal: str) -> dict[str, Any]:
    """Permission 11 from that position, as Pejabat (Pokja: Pengisi)."""
    res = access.check_action(
        load_access_db(),
        _permission_rows(),
        str(user.id),
        11,
        position_id,
        clock.today().isoformat(),
    )
    if not res["ok"]:
        raise ApiError("forbidden", refusal)
    return dict(res["holding"])


@transaction.atomic
def appoint_operator(user: User, position_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    holding = _manage_holding(
        user, str(position_id), "Menunjuk operator hanya dapat dilakukan Pejabat (Pokja: Pengisi)."
    )
    at = clock.now()
    today = clock.today()
    if (
        not (data.get("letter_no") or "").strip()
        or not data.get("letter_date")
        or not data.get("letter_file")
    ):
        raise ApiError("validation", "Nomor surat, tanggal, dan berkas PDF wajib diisi.")
    end = data.get("end_date")
    if end and _day(end) < today:
        raise ApiError("validation", "Tanggal akhir tidak boleh sebelum hari ini.")
    position = Position.objects.select_for_update().get(pk=position_id)
    nip = data["nip"].strip()
    existing = User.objects.filter(nip=nip).first()
    if existing:
        if PositionOccupancy.objects.filter(
            active_on(today), user=existing, position=position
        ).exists():
            raise ApiError("inv13", f"Pegawai ini sudah Pejabat {position.name}.")
        if PositionDelegate.objects.filter(
            active_on(today), user=existing, position=position
        ).exists():
            raise ApiError("validation", f"Pegawai ini sudah Operator {position.name}.")
        operator = existing
    else:
        staff = keycloak.find_staff(nip)
        if staff is None:
            raise ApiError("validation", "Pegawai tidak ditemukan.")
        operator = User.objects.create_user(
            nip=nip,
            email=staff["email"],
            full_name=staff["full_name"],
            created_via="delegation",
            # The directory carries no unit; the Operator works in the position's unit.
            org_unit_id=staff["org_unit_id"] or position.org_unit_id,
        )
    delegate = PositionDelegate.objects.create(
        position=position,
        user=operator,
        appointed_by_id=holding["id"],
        letter_no=data["letter_no"].strip(),
        letter_date=data["letter_date"],
        letter_object_key=data["letter_file"],
        start_date=today,
        end_date=end or None,
    )
    bump_auth_epoch(operator)
    notify(
        user=operator,
        kind="operator_appointed",
        text=(f"Anda ditunjuk sebagai operator untuk {position.name} oleh {user.full_name}"),
        target_url="/jabatan-saya",
        event_key=f"op-new:{delegate.id}",
        at=at,
    )
    record(
        action="tunjuk_operator",
        entity_type="PositionDelegate",
        entity_id=str(delegate.id),
        actor=user,
        acting_as="pejabat",
        acting_position=position,
        after={"user": str(operator.id), "letterNo": delegate.letter_no},
        at=at,
    )
    return operator.id


@transaction.atomic
def revoke_operator(user: User, delegate_id: uuid.UUID) -> None:
    delegate = (
        PositionDelegate.objects.select_for_update()
        .select_related("user", "position")
        .filter(pk=delegate_id)
        .first()
    )
    if delegate is None:
        raise ApiError("not_found", "Operator tidak ditemukan.")
    _manage_holding(
        user,
        str(delegate.position_id),
        "Mencabut operator hanya dapat dilakukan Pejabat (Pokja: Pengisi).",
    )
    at = clock.now()
    actor = Actor(user=user, at=at, today=clock.today().isoformat(), acting_as="pejabat")
    end_delegations([delegate], "revoked", actor)
    record(
        action="cabut_operator",
        entity_type="PositionDelegate",
        entity_id=str(delegate.id),
        actor=user,
        acting_as="pejabat",
        acting_position=delegate.position,
        after={"endReason": "revoked"},
        at=at,
    )


def my_positions(user: User) -> dict[str, Any]:
    """Cards for /jabatan-saya (FR-ADM-010)."""
    db = load_access_db()
    today = clock.today()
    iso = today.isoformat()
    perms = _permission_rows()
    officials = []
    for occ in PositionOccupancy.objects.filter(active_on(today), user=user).select_related(
        "position"
    ):
        pid = str(occ.position_id)
        members = PositionOccupancy.objects.filter(active_on(today), position_id=pid).count()
        operators = []
        for d in occ.delegates.select_related("user").order_by("start_date"):
            operators.append(
                {
                    "id": d.id,
                    "user_id": d.user_id,
                    "full_name": d.user.full_name,
                    "letter_no": d.letter_no,
                    "letter_date": d.letter_date,
                    "start_date": d.start_date,
                    "end_date": d.end_date,
                    "end_reason": d.end_reason,
                    "current": d.start_date <= today
                    and (d.end_date is None or d.end_date >= today),
                }
            )
        officials.append(
            {
                "occupancy_id": occ.id,
                "position_id": occ.position_id,
                "position_name": occ.position.name,
                "line": access.position_line(db, pid),
                "decree_no": occ.decree_no,
                "decree_date": occ.decree_date,
                "has_decree_file": bool(occ.decree_object_key),
                "start_date": occ.start_date,
                "is_filler": occ.is_filler,
                "is_multi": members > 1,
                "can_manage": access.check_action(db, perms, str(user.id), 11, pid, iso)["ok"],
                "operators": operators,
            }
        )
    operator_of = []
    for d in PositionDelegate.objects.filter(active_on(today), user=user).select_related(
        "position", "appointed_by__user"
    ):
        operator_of.append(
            {
                "delegate_id": d.id,
                "position_id": d.position_id,
                "position_name": d.position.name,
                "line": access.position_line(db, str(d.position_id)),
                "appointed_by": d.appointed_by.user.full_name,
                "letter_no": d.letter_no,
                "letter_date": d.letter_date,
                "start_date": d.start_date,
                "end_date": d.end_date,
            }
        )
    return {"officials": officials, "operator_of": operator_of}
