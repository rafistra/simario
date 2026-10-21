from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.core import clock
from simario.core.errors import ApiError

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(ListAPIView[Notification]):
    """The signed-in user's notifications, newest first (FR-NTF-013/014)."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):  # type: ignore[no-untyped-def]
        user = cast(User, self.request.user)
        return Notification.objects.filter(user=user).order_by("-created_at", "-id")


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["notifications"])
    def post(self, request: Request, pk: str) -> Response:
        updated = Notification.objects.filter(pk=pk, user=cast(User, request.user)).first()
        if updated is None:
            raise ApiError("not_found", "Notifikasi tidak ditemukan.")
        if updated.read_at is None:
            updated.read_at = clock.now()
            updated.save(update_fields=["read_at"])
        return Response(status=204)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None}, tags=["notifications"])
    def post(self, request: Request) -> Response:
        Notification.objects.filter(user=cast(User, request.user), read_at=None).update(
            read_at=clock.now()
        )
        return Response(status=204)
