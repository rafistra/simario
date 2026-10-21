from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from simario.accounts.models import User
from simario.core.permissions import has_permission


def test_creates_a_local_superadmin_after_seed_reference(db: None) -> None:
    call_command("seed_reference", stdout=StringIO())
    out = StringIO()
    call_command("create_superadmin", nip="199001012020011099", name="Admin Staging", stdout=out)
    user = User.objects.get(nip="199001012020011099")
    temp = out.getvalue().rsplit(": ", 1)[1].strip()
    assert user.is_local_account and user.must_change_password and user.check_password(temp)
    assert has_permission(user, 22)
    with pytest.raises(CommandError):
        call_command("create_superadmin", nip="199001012020011099", name="Lagi", stdout=out)
