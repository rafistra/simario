from typing import cast

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core.api import body
from simario.core.errors import ApiError

from . import selectors, services


def _user(request: Request) -> User:
    return cast(User, request.user)


class SheetView(APIView):
    """GET: the running sheet, or a frozen copy with `?snapshot=` (`SheetView`, FR-LBR-001)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("snapshot", str, required=False)],
        responses={200: dict},
        tags=["sheets"],
    )
    def get(self, request: Request, pk: str, year: int, tw: int) -> Response:
        snapshot = request.query_params.get("snapshot") or None
        return Response(selectors.build_sheet_view(_user(request), pk, year, tw, snapshot))  # type: ignore[arg-type]


class PhotosSerializer(serializers.Serializer[None]):
    quarter_id = serializers.UUIDField()
    attachment_ids = serializers.ListField(child=serializers.UUIDField())


class PhotosView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PhotosSerializer, responses={204: None}, tags=["sheets"])
    def put(self, request: Request, pk: str, section: str) -> Response:
        data = body(PhotosSerializer, request)
        services.set_photos(
            _user(request),
            pk,
            data["quarter_id"],
            section,
            [str(i) for i in data["attachment_ids"]],
        )
        return Response(status=204)


class PrintSerializer(serializers.Serializer[None]):
    kinds = serializers.ListField(
        child=serializers.ChoiceField(choices=["komunikasi", "mutu"]), min_length=1
    )


class PrintView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PrintSerializer, responses={201: dict}, tags=["sheets"])
    def post(self, request: Request, pk: str, year: int, tw: int) -> Response:
        kinds = body(PrintSerializer, request)["kinds"]
        ids = services.print_sheets(_user(request), pk, year, tw, kinds)  # type: ignore[arg-type]
        return Response({"ids": ids}, status=201)


class SnapshotSearchView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("number", str)], responses={200: dict}, tags=["sheets"]
    )
    def get(self, request: Request) -> Response:
        number = request.query_params.get("number") or ""
        if not number.strip():
            raise ApiError("validation", "Masukkan nomor cetak.")
        return Response(selectors.find_by_number(_user(request), number))
