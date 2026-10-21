from typing import Any

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "simario.accounts"
    label = "accounts"

    def ready(self) -> None:
        from django.contrib.auth.signals import user_logged_in

        from .middleware import SESSION_EPOCH_KEY

        def remember_epoch(sender: Any, request: Any, user: Any, **kwargs: Any) -> None:
            # Every login path (local, OIDC, dev impersonation) records the epoch it started at.
            if request is not None and hasattr(request, "session"):
                request.session[SESSION_EPOCH_KEY] = user.auth_epoch

        # weak=False: a nested function has no other reference and would be collected.
        user_logged_in.connect(remember_epoch, weak=False, dispatch_uid="simario_remember_epoch")
