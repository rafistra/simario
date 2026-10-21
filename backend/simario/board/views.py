from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User

from . import selectors


def _user(request: Request) -> User:
    return cast(User, request.user)


class BoardView(APIView):
    """GET: the risk board of a position and fiscal year (`BoardView`, FR-PPN-001)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["board"])
    def get(self, request: Request, pk: str, year: int) -> Response:
        return Response(selectors.build_board(_user(request), pk, year))  # type: ignore[arg-type]


class ThreadView(APIView):
    """GET: a risk thread (`ThreadView`, FR-PPN-002). With `?since=`: the count of newer comments
    by others, for the 30-second poll (NFR-015)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("since", str, required=False)],
        responses={200: dict},
        tags=["board"],
    )
    def get(self, request: Request, pk: str) -> Response:
        since = request.query_params.get("since")
        if since:
            return Response(selectors.thread_since(_user(request), pk, since))  # type: ignore[arg-type]
        return Response(selectors.build_thread(_user(request), pk))  # type: ignore[arg-type]


class ParticipantsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("quarterId", str)], responses={200: dict}, tags=["board"]
    )
    def get(self, request: Request, pk: str) -> Response:
        quarter = request.query_params.get("quarterId") or request.query_params.get("quarter_id")
        return Response(selectors.participants(_user(request), pk, quarter or ""))  # type: ignore[arg-type]
