"""User administration (FR-ADM-004, 009). Ports the user part of adminApi in
frontend/src/data/api/admin.ts: same checks, error copy and audit actions."""

import datetime as dt
import re
import secrets
import string
import uuid
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Q

from simario.audit.services import record_by
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.domain import access
from simario.org.models import OrgUnit, PositionDelegate, PositionOccupancy, Role, UserRole
from simario.org.services import end_delegations

from .models import User
from .selectors import load_access_db
from .services import bump_auth_epoch

NIP = re.compile(r"^\d{18}$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+$")


def temporary_password() -> str:
    """Shown once to the administrator; never stored in the audit trail (FR-ADM-008)."""
    alphabet = string.ascii_lowercase + string.digits
    return "Simario-" + "".join(secrets.choice(alphabet) for _ in range(6)) + "!"


def assert_manage_roles_remains(today: str) -> None:
    """INV-5: at least one active user keeps permission 22."""
    db = load_access_db()
    if not any(u["active"] and access.has_permission(db, u["id"], 22, today) for u in db["users"]):
        raise ApiError(
            "inv5",
            "Harus tetap ada setidaknya satu pengguna aktif yang dapat mengelola peran dan akses.",
        )


@transaction.atomic
def add_user(actor: Actor, data: dict[str, Any]) -> tuple[uuid.UUID, str | None]:
    nip = data["nip"].strip()
    full_name = data["full_name"].strip()
    email = data["email"].strip()
    if not NIP.match(nip):
        raise ApiError("validation", "NIP harus 18 digit.")
    if User.objects.filter(nip=nip).exists():
        raise ApiError("validation", "NIP ini sudah terdaftar.")
    if not full_name:
        raise ApiError("validation", "Nama lengkap wajib diisi.")
    if not EMAIL.match(email):
        raise ApiError("validation", "Format email tidak valid.")
    local = bool(data["is_local_account"])
    temp = temporary_password() if local else None
    unit = data.get("org_unit_id")
    if unit and not OrgUnit.objects.filter(pk=unit).exists():
        raise ApiError("not_found", "Data tidak ditemukan.")
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                nip=nip,
                password=temp,
                email=email,
                full_name=full_name,
                is_local_account=local,
                must_change_password=local,
                created_via="admin",
                org_unit_id=unit,
            )
    except IntegrityError as exc:  # registered by another administrator since the check
        raise ApiError("validation", "NIP ini sudah terdaftar.") from exc
    record_by(
        actor,
        "tambah_pengguna",
        "User",
        user.id,
        None,
        {"nip": nip, "fullName": full_name, "local": local},
    )
    return user.id, temp


@transaction.atomic
def set_manual_roles(actor: Actor, user_id: uuid.UUID, role_ids: list[uuid.UUID]) -> None:
    user = User.objects.select_for_update().get(pk=user_id)
    if Role.objects.filter(pk__in=role_ids).count() != len(set(role_ids)):
        raise ApiError("not_found", "Data tidak ditemukan.")
    manual = UserRole.objects.filter(user=user, source="manual")
    before = [str(r.role_id) for r in manual]
    manual.delete()
    UserRole.objects.bulk_create(
        [UserRole(user=user, role_id=role_id, source="manual") for role_id in role_ids]
    )
    assert_manage_roles_remains(actor.today)
    bump_auth_epoch(user)
    record_by(
        actor,
        "ubah_peran_pengguna",
        "User",
        user.id,
        {"roles": before},
        {"roles": [str(r) for r in role_ids]},
    )


@transaction.atomic
def reset_password(actor: Actor, user_id: uuid.UUID) -> str:
    user = User.objects.select_for_update().get(pk=user_id)
    if not user.is_local_account:
        raise ApiError("not_local", "Akun SSO mengatur kata sandinya di Keycloak.")
    temp = temporary_password()
    user.set_password(temp)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    # Passwords are never recorded in the audit trail (FR-ADM-008).
    record_by(actor, "atur_ulang_kata_sandi", "User", user.id, None, None)
    return temp


def _active(today: dt.date) -> Q:
    return Q(start_date__lte=today) & (Q(end_date__isnull=True) | Q(end_date__gte=today))


def deactivation_impact(user_id: uuid.UUID, today: str) -> dict[str, Any]:
    day = dt.date.fromisoformat(today)
    occupancies = list(
        PositionOccupancy.objects.filter(_active(day), user_id=user_id).select_related(
            "position__position_type"
        )
    )
    delegations = PositionDelegate.objects.filter(_active(day), user_id=user_id).count()
    appointed = PositionDelegate.objects.filter(_active(day), appointed_by__in=occupancies).count()
    filler_block = next(
        (
            o.position.name
            for o in occupancies
            if o.is_filler
            and o.position.position_type.allows_multiple_officials
            and PositionOccupancy.objects.filter(_active(day), position_id=o.position_id)
            .exclude(pk=o.pk)
            .exists()
        ),
        None,
    )
    return {
        "occupancies": len(occupancies),
        "delegations": delegations,
        "appointed_operators": appointed,
        "filler_block": filler_block,
    }


@transaction.atomic
def deactivate_user(actor: Actor, user_id: uuid.UUID) -> dict[str, Any]:
    """Deactivate, never delete: holdings and delegations end; INV-4/INV-5 guards."""
    user = User.objects.select_for_update().get(pk=user_id)
    impact = deactivation_impact(user.id, actor.today)
    if impact["filler_block"]:
        raise ApiError(
            "filler",
            f"Pengguna ini Pengisi {impact['filler_block']}. Pindahkan tanda Pengisi ke anggota "
            "lain terlebih dahulu.",
        )
    today = dt.date.fromisoformat(actor.today)
    yesterday = today - dt.timedelta(days=1)
    for occ in PositionOccupancy.objects.filter(_active(today), user=user):
        end_delegations(
            PositionDelegate.objects.filter(_active(today), appointed_by=occ).select_related(
                "user", "position"
            ),
            "official_changed",
            actor,
        )
        occ.end_date = max(occ.start_date, yesterday)
        occ.save(update_fields=["end_date"])
    end_delegations(
        PositionDelegate.objects.filter(_active(today), user=user).select_related(
            "user", "position"
        ),
        "user_deactivated",
        actor,
    )
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert_manage_roles_remains(actor.today)
    bump_auth_epoch(user)
    record_by(
        actor,
        "nonaktifkan_pengguna",
        "User",
        user.id,
        {"active": True},
        {
            "active": False,
            "occupancies": impact["occupancies"],
            "delegations": impact["delegations"],
            "appointedOperators": impact["appointed_operators"],
            "fillerBlock": None,
        },
    )
    return impact


@transaction.atomic
def reactivate_user(actor: Actor, user_id: uuid.UUID) -> None:
    user = User.objects.select_for_update().get(pk=user_id)
    user.is_active = True
    user.save(update_fields=["is_active"])
    record_by(actor, "aktifkan_pengguna", "User", user.id, {"active": False}, {"active": True})
