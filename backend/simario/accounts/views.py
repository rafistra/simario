from typing import cast

from django.conf import settings
from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.core.errors import ApiError

from . import services
from .models import User
from .selectors import build_me, holds_position
from .serializers import (
    ActivePositionSerializer,
    AuthConfigSerializer,
    LoginSerializer,
    MeSerializer,
    PasswordSerializer,
    SignInResultSerializer,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthConfigView(APIView):
    """Login page settings; also sets the CSRF cookie the SPA sends back."""

    permission_classes = [AllowAny]

    @extend_schema(responses=AuthConfigSerializer, tags=["auth"])
    def get(self, request: Request) -> Response:
        return Response(
            {"dev_tools": settings.SIMARIO_DEV_TOOLS, "oidc_enabled": bool(settings.OIDC_ISSUER)}
        )


@method_decorator(csrf_protect, name="dispatch")
class LocalLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    @extend_schema(request=LoginSerializer, responses=SignInResultSerializer, tags=["auth"])
    def post(self, request: Request) -> Response:
        body = LoginSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = services.local_sign_in(
            request._request, body.validated_data["nip"], body.validated_data["password"]
        )
        return Response({"ok": True, "user_id": str(user.id)})


class PasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordSerializer, responses={204: None}, tags=["auth"])
    def post(self, request: Request) -> Response:
        body = PasswordSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.change_password(
            request._request,
            cast(User, request.user),
            body.validated_data["new_password"],
            body.validated_data.get("old_password"),
        )
        return Response(status=204)


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None}, tags=["auth"])
    def post(self, request: Request) -> Response:
        logout(request._request)
        return Response(status=204)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer, tags=["me"], operation_id="me_retrieve")
    def get(self, request: Request) -> Response:
        return Response(MeSerializer(build_me(cast(User, request.user))).data)


class ActivePositionView(APIView):
    """FR-AUT-009: the position the user last acted through."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ActivePositionSerializer, responses={204: None}, tags=["me"])
    def put(self, request: Request) -> Response:
        body = ActivePositionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = cast(User, request.user)
        position_id = str(body.validated_data["position_id"])
        if not holds_position(user, position_id):
            raise ApiError("forbidden", "Anda tidak memegang jabatan ini.")
        user.last_position_id = body.validated_data["position_id"]
        user.save(update_fields=["last_position"])
        return Response(status=204)
