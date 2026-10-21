from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User

from . import selectors


def _user(request: Request) -> User:
    return cast(User, request.user)


class RegisterView(APIView):
    """GET: the register as the signed-in viewer may see it (`RegisterView`, FR-REG-012)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["registers"])
    def get(self, request: Request, pk: str, year: int) -> Response:
        return Response(selectors.build_register_view(_user(request), pk, year))  # type: ignore[arg-type]
