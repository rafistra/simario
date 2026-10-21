from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User

from . import selectors, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class AssessmentPageView(APIView):
    """GET: the assessment page of a position and quarter (`AssessmentView`, FR-NIL-001). With
    `?blind=1` and permission 24 the Superadmin sees unopened assessments; every such view is
    audit-logged (FR-NIL-012)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("blind", bool, required=False)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request, pk: str, year: int, tw: int) -> Response:
        blind = request.query_params.get("blind") in ("1", "true")
        view = selectors.build_assessment(_user(request), pk, year, tw, blind)  # type: ignore[arg-type]
        if view["blind"]["granted"]:
            services.log_blind_view(_user(request), pk, view["quarter"]["id"])
        return Response(view)


class FinalisePreviewView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("assessorPositionId", str)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request, pk: str, year: int, tw: int) -> Response:
        assessor = request.query_params.get("assessorPositionId") or ""
        return Response(selectors.finalise_preview(_user(request), pk, year, tw, assessor))  # type: ignore[arg-type]


class QueueView(APIView):
    """GET: the Lini 3 queue (`QueueView`, FR-NIL-010)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("quarterId", str, required=False)],
        responses={200: dict},
        tags=["assessments"],
    )
    def get(self, request: Request) -> Response:
        quarter = request.query_params.get("quarterId") or None
        return Response(selectors.build_queue(_user(request), quarter))
