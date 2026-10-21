from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .collections import COLLECTIONS
from .errors import ApiError


class CollectionView(APIView):
    """GET /api/v1/collections/<name>: one prototype-shaped collection (signed-in users)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["collections"], responses={200: dict})
    def get(self, request: Request, name: str) -> Response:
        if name not in COLLECTIONS:
            raise ApiError("not_found", "Data tidak ditemukan.")
        queryset, serializer = COLLECTIONS[name]
        return Response(serializer(queryset(), many=True).data)
