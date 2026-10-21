import pytest

from simario.accounts.models import User
from simario.core import clock

LOCAL_NIP = "199001012020011001"
LOCAL_PASSWORD = "Sandi-Awal-2027"


@pytest.fixture
def local_user(db: None) -> User:
    clock.set_now(clock.parse_local("2027-04-06T09:00"))
    return User.objects.create_user(
        nip=LOCAL_NIP, password=LOCAL_PASSWORD, full_name="Lestari", is_local_account=True
    )


@pytest.fixture
def sso_user(db: None) -> User:
    return User.objects.create_user(nip="198204172008011003", full_name="Andi Wirawan")
