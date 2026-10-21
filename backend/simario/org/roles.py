"""Roles and permissions (FR-ADM-001, 002, 009) and monitoring assignments (FR-ADM-006,
INV-14). Ports addRole, deleteRole, setPermission, addAssignments and removeAssignment in
frontend/src/data/api/admin.ts: same checks, error copy and audit actions."""

import datetime as dt
import uuid
from collections.abc import Iterable
from typing import Any

from django.db import transaction

from simario.accounts.admin_services import assert_manage_roles_remains
from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.accounts.services import bump_auth_epoch
from simario.audit.services import record_by
from simario.calendar.models import Quarter
from simario.core.errors import ApiError
from simario.core.permissions import Actor, has_permission
from simario.domain import access

from .holdings import active_on
from .models import (
    MonitoringAssignment,
    MonitoringSupport,
    Permission,
    Position,
    PositionDelegate,
    PositionOccupancy,
    PositionType,
    Role,
    RolePermission,
    UserRole,
)

ROMAN = ["I", "II", "III", "IV"]


def _bump(user_ids: Iterable[str]) -> None:
    for user in User.objects.filter(pk__in=set(user_ids)):
        bump_auth_epoch(user)


def _role_holders(role_id: str, today: str) -> list[str]:
    db = load_access_db()
    return [
        u["id"] for u in db["users"] if role_id in access.effective_role_ids(db, u["id"], today)
    ]


def _role_code(name: str) -> str:
    base = "".join(w[0] for w in name.split()).upper()[:3]
    code, n = base, 1
    while Role.objects.filter(code=code).exists():
        n += 1
        code = f"{base}{n}"
    return code


@transaction.atomic
def add_role(actor: Actor, name: str) -> uuid.UUID:
    n = name.strip()
    if not n:
        raise ApiError("validation", "Nama peran wajib diisi.")
    if Role.objects.filter(name__iexact=n).exists():
        raise ApiError("validation", "Nama peran sudah dipakai.")
    role = Role.objects.create(code=_role_code(n), name=n, is_locked=False)
    record_by(actor, "tambah_peran", "Role", role.id, None, {"name": n})
    return role.id


@transaction.atomic
def delete_role(actor: Actor, role_id: uuid.UUID) -> None:
    role = Role.objects.select_for_update().get(pk=role_id)
    if role.is_locked:
        raise ApiError("locked", "Peran Superadmin terkunci.")
    holders = UserRole.objects.filter(role=role).count()
    types = list(PositionType.objects.filter(default_role=role).values_list("name", flat=True))
    if holders or types:
        raise ApiError(
            "in_use",
            f"Peran ini menjadi peran bawaan {', '.join(types)}."
            if types
            else f"Peran ini dipegang {holders} pengguna.",
        )
    RolePermission.objects.filter(role=role).delete()
    role.delete()
    record_by(actor, "hapus_peran", "Role", role_id, {"name": role.name}, None)


@transaction.atomic
def set_permission(
    actor: Actor, role_id: uuid.UUID, code: int, enabled: bool, scope: str | None
) -> None:
    role = Role.objects.select_for_update().get(pk=role_id)
    definition = Permission.objects.get(pk=code)
    if role.is_locked:
        raise ApiError("locked", "Peran terkunci dan hanya dapat dibaca.")
    if enabled and not has_permission(actor.user, code):
        raise ApiError("forbidden", "Anda tidak dapat memberikan izin yang tidak Anda miliki.")
    if (
        enabled
        and code == 10
        and not PositionType.objects.filter(line=3, default_role=role).exists()
    ):
        raise ApiError(
            "validation",
            "Izin 10 hanya dapat diberikan pada peran bawaan jenis jabatan Lini 3 dan Superadmin.",
        )
    # Holders before the change lose access; holders after it gain it (FR-AUT-008).
    holders = _role_holders(str(role.id), actor.today)
    existing = RolePermission.objects.filter(role=role, permission=definition).first()
    before = (
        {"roleId": str(role.id), "permission": code, "scope": existing.scope} if existing else None
    )
    RolePermission.objects.filter(role=role, permission=definition).delete()
    if enabled:
        RolePermission.objects.create(
            role=role,
            permission=definition,
            scope=(scope or "sendiri") if definition.scope_kind == "scoped" else None,
        )
    assert_manage_roles_remains(actor.today)
    _bump(holders)
    record_by(
        actor,
        "ubah_izin_peran",
        "Role",
        role.id,
        before,
        {"permission": code, "enabled": enabled, "scope": scope},
    )


def _key(q: Quarter) -> int:
    return q.fiscal_year_id * 10 + q.number


def _holders_of_positions(position_ids: Iterable[Any], actor: Actor) -> list[str]:
    ids = list(position_ids)
    day = dt.date.fromisoformat(actor.today)
    occupants = PositionOccupancy.objects.filter(active_on(day), position_id__in=ids)
    delegates = PositionDelegate.objects.filter(active_on(day), position_id__in=ids)
    return [str(o.user_id) for o in occupants] + [str(d.user_id) for d in delegates]


def _assignment_positions(a: MonitoringAssignment) -> list[Any]:
    return [a.lead_position_id, *(s.position_id for s in a.supports.all())]


@transaction.atomic
def add_assignments(actor: Actor, data: dict[str, Any]) -> None:
    targets = data["target_position_ids"]
    if not targets:
        raise ApiError("validation", "Pilih minimal satu jabatan Lini 1.")
    if not data.get("lead_position_id"):
        raise ApiError("validation", "Penanggung jawab wajib dipilih.")
    decree = (data.get("decree_no") or "").strip()
    if not decree:
        raise ApiError("validation", "Nomor SK wajib diisi.")
    quarters = {str(q.id): q for q in Quarter.objects.all()}
    q_from = quarters.get(str(data["quarter_from_id"]))
    q_to = quarters.get(str(data["quarter_to_id"]))
    if q_from is None or q_to is None:
        raise ApiError("validation", "Triwulan wajib dipilih.")
    lo, hi = _key(q_from), _key(q_to)
    if lo > hi:
        raise ApiError("validation", "Triwulan awal harus sebelum atau sama dengan triwulan akhir.")
    # Lock the targets (also those without any assignment yet) so INV-14 holds under concurrency.
    list(Position.objects.select_for_update().filter(pk__in=targets).order_by("pk"))
    existing = list(
        MonitoringAssignment.objects.select_for_update()
        .filter(target_position_id__in=targets)
        .select_related("target_position")
    )
    for target in targets:
        for clash in existing:
            if str(clash.target_position_id) != str(target):
                continue
            c_lo = _key(quarters[str(clash.quarter_from_id)])
            c_hi = _key(quarters[str(clash.quarter_to_id)])
            if c_lo <= hi and lo <= c_hi:
                first = min(
                    (q for q in quarters.values() if max(lo, c_lo) <= _key(q) <= min(hi, c_hi)),
                    key=_key,
                )
                raise ApiError(
                    "inv14",
                    f"{clash.target_position.name} sudah memiliki penanggung jawab pada "
                    f"TW {ROMAN[first.number - 1]} TA {first.fiscal_year_id}.",
                )
    supports = data.get("supports") or []
    for target in targets:
        assignment = MonitoringAssignment.objects.create(
            target_position_id=target,
            lead_position_id=data["lead_position_id"],
            quarter_from=q_from,
            quarter_to=q_to,
            decree_no=decree,
        )
        MonitoringSupport.objects.bulk_create(
            [
                MonitoringSupport(
                    assignment=assignment, position_id=s["position_id"], domain=s["domain"]
                )
                for s in supports
            ]
        )
        record_by(
            actor,
            "tambah_penugasan",
            "MonitoringAssignment",
            assignment.id,
            None,
            {
                "target": str(target),
                "lead": str(data["lead_position_id"]),
                "from": str(q_from.id),
                "to": str(q_to.id),
            },
        )
    positions = [data["lead_position_id"], *(s["position_id"] for s in supports)]
    _bump(_holders_of_positions(positions, actor))


@transaction.atomic
def remove_assignment(actor: Actor, assignment_id: uuid.UUID) -> None:
    assignment = (
        MonitoringAssignment.objects.select_for_update()
        .prefetch_related("supports")
        .filter(pk=assignment_id)
        .first()
    )
    if assignment is None:
        raise ApiError("not_found", "Data tidak ditemukan.")
    before = {
        "targetPositionId": str(assignment.target_position_id),
        "leadPositionId": str(assignment.lead_position_id),
        "supports": [
            {"positionId": str(s.position_id), "domain": s.domain}
            for s in assignment.supports.all()
        ],
        "quarterFromId": str(assignment.quarter_from_id),
        "quarterToId": str(assignment.quarter_to_id),
        "decreeNo": assignment.decree_no,
    }
    positions = _assignment_positions(assignment)
    assignment.delete()
    record_by(actor, "hapus_penugasan", "MonitoringAssignment", assignment_id, before, None)
    _bump(_holders_of_positions(positions, actor))
