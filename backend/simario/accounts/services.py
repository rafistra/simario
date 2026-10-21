"""Sign-in, password and session rules (FR-AUT-001…008). Copy matches the prototype's authApi
(frontend/src/data/repository.ts)."""

import datetime as dt

from django.contrib.auth import login
from django.db import transaction
from django.db.models import F
from django.http import HttpRequest

from simario.audit.services import record
from simario.core import clock
from simario.core.errors import ApiError

from .models import LoginLockout, User

LOCK_ATTEMPTS = 5
LOCK_MINUTES = 15

WRONG_CREDENTIALS = "NIP atau kata sandi tidak sesuai"
INACTIVE = "Akun Anda tidak aktif. Hubungi Superadmin."
UNREGISTERED = (
    "Akun Anda belum terdaftar di SIMARIO. Hubungi Superadmin, atau minta pejabat yang Anda "
    "bantu menunjuk Anda sebagai operator."
)


def _locked_message(minutes: int) -> str:
    return (
        f"Akun dikunci sementara setelah {LOCK_ATTEMPTS} kali gagal masuk. "
        f"Coba lagi dalam {minutes} menit."
    )


def sign_in(request: HttpRequest, user: User) -> None:
    """Starts a session; the user_logged_in receiver records the session's auth epoch."""
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")


def bump_auth_epoch(user: User) -> None:
    """Ends every session of `user` on its next request (FR-AUT-008)."""
    User.objects.filter(pk=user.pk).update(auth_epoch=F("auth_epoch") + 1)
    user.refresh_from_db(fields=["auth_epoch"])


def local_sign_in(request: HttpRequest, nip: str, password: str) -> User:
    """Local account fallback with a 5-attempt / 15-minute lockout (FR-AUT-002). Not atomic:
    the failure count must persist although the call raises."""
    at = clock.now()
    lock = LoginLockout.objects.filter(nip=nip).first()
    if lock and lock.until and at < lock.until:
        left = max(1, int((lock.until - at) / dt.timedelta(minutes=1)))
        raise ApiError("locked_out", _locked_message(left))
    user = User.objects.filter(nip=nip.strip(), is_local_account=True).first()
    if not user or not user.check_password(password):
        fails = (0 if lock and lock.until else (lock.fails if lock else 0)) + 1
        locked = fails >= LOCK_ATTEMPTS
        LoginLockout.objects.update_or_create(
            nip=nip,
            defaults={
                "fails": fails,
                "until": at + dt.timedelta(minutes=LOCK_MINUTES) if locked else None,
            },
        )
        if locked:
            raise ApiError("locked_out", _locked_message(LOCK_MINUTES))
        raise ApiError("login_failed", WRONG_CREDENTIALS)
    if not user.is_active:
        raise ApiError("login_failed", INACTIVE)
    LoginLockout.objects.filter(nip=nip).delete()
    sign_in(request, user)
    return user


@transaction.atomic
def change_password(
    request: HttpRequest, user: User, new_password: str, old_password: str | None = None
) -> None:
    """FR-AUT-003 (forced, no old password) and FR-AUT-004 (self-service). Other sessions end;
    the current one continues."""
    if not user.is_local_account:
        raise ApiError("not_local", "Hanya akun lokal yang memakai kata sandi SIMARIO.")
    if not user.must_change_password and not user.check_password(old_password or ""):
        raise ApiError("old_password", "Kata sandi lama tidak sesuai")
    if len(new_password) < 12:
        raise ApiError("too_short", "Minimal 12 karakter.")
    if user.check_password(new_password):
        raise ApiError("same", "Kata sandi baru harus berbeda dari kata sandi awal.")
    user.set_password(new_password)
    user.must_change_password = False
    user.auth_epoch += 1
    user.save(update_fields=["password", "must_change_password", "auth_epoch"])
    # Passwords are never recorded in the audit trail (FR-ADM-008).
    record(action="ganti_kata_sandi", entity_type="User", entity_id=str(user.id), actor=user)
    sign_in(request, user)
