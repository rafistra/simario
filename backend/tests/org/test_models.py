import pytest
from django.db import IntegrityError, transaction

from simario.accounts.models import User
from simario.org.models import OrgUnit, Permission, Position, PositionType, Role, RolePermission

pytestmark = pytest.mark.django_db


def _type(role: Role) -> PositionType:
    return PositionType.objects.create(
        code="PPK", name="PPK", line=1, default_role=role, identity_schema=[]
    )


def test_position_code_unique_per_org_unit() -> None:
    role = Role.objects.create(code="PMR", name="Pemilik Risiko")
    ptype = _type(role)
    a = OrgUnit.objects.create(code="A", name="Unit A")
    b = OrgUnit.objects.create(code="B", name="Unit B")
    Position.objects.create(code="PPK-1", name="PPK 1", org_unit=a, position_type=ptype)
    Position.objects.create(code="PPK-1", name="PPK 1", org_unit=b, position_type=ptype)
    with pytest.raises(IntegrityError), transaction.atomic():
        Position.objects.create(code="PPK-1", name="PPK 1 lagi", org_unit=a, position_type=ptype)


def test_user_nip_unique() -> None:
    User.objects.create_user(nip="1990", email="a@x.id", full_name="A")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(nip="1990", email="b@x.id", full_name="B")


def test_role_permission_unique() -> None:
    role = Role.objects.create(code="PMR", name="Pemilik Risiko")
    perm = Permission.objects.create(
        code=1,
        group="Lini 1",
        label="Lihat",
        scope_kind="scoped",
        requires_official=False,
        is_drafting=False,
        is_content_action=False,
    )
    RolePermission.objects.create(role=role, permission=perm, scope="unit")
    with pytest.raises(IntegrityError), transaction.atomic():
        RolePermission.objects.create(role=role, permission=perm, scope="semua")


def test_user_has_no_django_permissions_api() -> None:
    assert not hasattr(User, "is_superuser")


def test_local_password_is_hashed() -> None:
    user = User.objects.create_user(nip="1991", password="rahasia-sekali", full_name="C")
    assert user.password != "rahasia-sekali"
    assert user.check_password("rahasia-sekali")
    assert user.auth_epoch == 0
    assert user.created_via == "admin"
