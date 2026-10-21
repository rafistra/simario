from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User

from . import selectors


class HomeView(APIView):
    """GET: the home cards for the active holding (`HomeView`, FR-BRD-001 … 010)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("position", str, required=False)],
        responses={200: dict},
        tags=["home"],
    )
    def get(self, request: Request) -> Response:
        position = request.query_params.get("position") or None
        return Response(selectors.build_home(cast(User, request.user), position))


class MyPositionsView(APIView):
    """GET: Lini 1 positions in the viewer's scope (`PositionListRow[]`, FR-BRD-011)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict}, tags=["home"])
    def get(self, request: Request) -> Response:
        return Response(selectors.build_position_list(cast(User, request.user)))
