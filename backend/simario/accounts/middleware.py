from collections.abc import Callable

from django.contrib.auth import logout
from django.http import HttpRequest, HttpResponse

SESSION_EPOCH_KEY = "auth_epoch"


class AuthEpochMiddleware:
    """Ends sessions started before the user's roles, holdings or password changed
    (FR-AUT-008): the session's epoch no longer matches User.auth_epoch."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            if request.session.get(SESSION_EPOCH_KEY) != user.auth_epoch:
                logout(request)
        return self.get_response(request)
