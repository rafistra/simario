"""SSO through Keycloak (FR-AUT-001, spec §4.4). Users are matched by the NIP claim and never
created from a sign-in (RB-AUT-003). Moving to sso.ikn.go.id only changes the OIDC_* settings."""

from typing import Any

from django.conf import settings
from django.db.models import QuerySet
from mozilla_django_oidc.auth import OIDCAuthenticationBackend
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView

from simario.audit.services import record

from .models import User
from .oidc_config import oidc_endpoints

__all__ = ["SimarioCallbackView", "SimarioOIDCBackend", "oidc_endpoints"]

FAILURE_KEY = "oidc_failure"


class SimarioOIDCBackend(OIDCAuthenticationBackend):  # type: ignore[misc]
    def filter_users_by_claims(self, claims: dict[str, Any]) -> QuerySet[User]:
        nip = claims.get(settings.OIDC_NIP_CLAIM)
        return User.objects.filter(nip=nip) if nip else User.objects.none()

    def create_user(self, claims: dict[str, Any]) -> None:
        nip = str(claims.get(settings.OIDC_NIP_CLAIM, ""))
        record(action="masuk_ditolak_belum_terdaftar", entity_type="User", entity_id=nip)
        self.request.session[FAILURE_KEY] = "belum-terdaftar"
        return None

    def update_user(self, user: User, claims: dict[str, Any]) -> User:
        if not user.is_active:
            # The callback view refuses inactive users; remember why for the login page.
            self.request.session[FAILURE_KEY] = "tidak-aktif"
            return user
        sub = claims.get("sub")
        if sub and not user.keycloak_sub:
            user.keycloak_sub = sub
            user.save(update_fields=["keycloak_sub"])
        return user


class SimarioCallbackView(OIDCAuthenticationCallbackView):  # type: ignore[misc]
    @property
    def failure_url(self) -> str:
        reason = self.request.session.pop(FAILURE_KEY, "sso-gagal")
        return f"/login?alasan={reason}"
