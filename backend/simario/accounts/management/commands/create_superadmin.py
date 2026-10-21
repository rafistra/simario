"""First administrator of a fresh environment (staging/production after `seed_reference`):
a local account with the Superadmin role and a temporary password shown once."""

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from simario.accounts.admin_services import temporary_password
from simario.accounts.models import User
from simario.audit.services import record
from simario.org.models import Role, UserRole

SUPERADMIN = "SAD"


class Command(BaseCommand):
    help = "Create a local Superadmin account (password must be changed at first sign-in)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--nip", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--email", default="")

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        nip = options["nip"].strip()
        if User.objects.filter(nip=nip).exists():
            raise CommandError(f"NIP {nip} sudah terdaftar.")
        role = Role.objects.filter(code=SUPERADMIN).first()
        if role is None:
            raise CommandError("Peran Superadmin belum ada. Jalankan seed_reference dahulu.")
        temp = temporary_password()
        user = User.objects.create_user(
            nip=nip,
            password=temp,
            full_name=options["name"].strip(),
            email=options["email"].strip(),
            is_local_account=True,
            must_change_password=True,
        )
        UserRole.objects.create(user=user, role=role, source="manual")
        record(
            action="tambah_pengguna",
            entity_type="User",
            entity_id=str(user.id),
            acting_as="sistem",
            after={"nip": nip, "fullName": user.full_name, "local": True, "role": SUPERADMIN},
        )
        self.stdout.write(f"Superadmin {nip} dibuat. Kata sandi sementara: {temp}")
