"""Users (PRD §2.8.1 User). NIP is the stable identifier; SSO never creates users (RB-AUT-003).
No Django permission framework: capabilities come from permission codes 1–26 (FR-ADM-002)."""

from typing import ClassVar

from django.contrib.auth.base_user import AbstractBaseUser
from django.db import models

from simario.core.models import UUIDModel

from .managers import UserManager


class User(UUIDModel, AbstractBaseUser):
    CREATED_VIA = [("admin", "admin"), ("delegation", "delegation")]

    nip = models.CharField(max_length=32, unique=True)
    email = models.EmailField(blank=True)
    full_name = models.CharField(max_length=200)
    is_local_account = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)
    created_via = models.CharField(max_length=16, choices=CREATED_VIA, default="admin")
    is_active = models.BooleanField(default=True)
    org_unit = models.ForeignKey(
        "org.OrgUnit", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # Bumped when roles, holdings or delegations change; sessions with an older epoch end
    # (FR-AUT-008).
    auth_epoch = models.PositiveIntegerField(default=0)
    # Last position acted through (FR-AUT-009).
    last_position = models.ForeignKey(
        "org.Position", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    keycloak_sub = models.CharField(max_length=64, null=True, blank=True, unique=True)

    USERNAME_FIELD = "nip"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    def __str__(self) -> str:
        return f"{self.full_name} ({self.nip})"


class LoginLockout(models.Model):
    """Failed local sign-ins per NIP: 5 failures lock for 15 minutes (FR-AUT-002)."""

    nip = models.CharField(max_length=32, unique=True)
    fails = models.PositiveSmallIntegerField(default=0)
    until = models.DateTimeField(null=True, blank=True)
