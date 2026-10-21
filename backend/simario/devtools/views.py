"""Development tools (spec §4.5): persona sign-in, simulated clock and demo reset. Every view
answers 404 unless SIMARIO_DEV_TOOLS is on (never in production)."""

from typing import Any

from django.conf import settings
from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from simario.accounts.models import User
from simario.accounts.selectors import VIEW_ORDER, load_access_db
from simario.accounts.serializers import SignInResultSerializer
from simario.accounts.services import INACTIVE, UNREGISTERED, sign_in
from simario.audit.services import record
from simario.core import clock, scheduler
from simario.core.errors import ApiError
from simario.domain import access
from simario.org.models import Position, Role

from .seed import load_demo, load_raw


class DevToolsView(APIView):
    permission_classes = [AllowAny]

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        if not settings.SIMARIO_DEV_TOOLS:
            raise ApiError("not_found", "Data tidak ditemukan.")
        super().initial(request, *args, **kwargs)


class NipSerializer(serializers.Serializer[None]):
    nip = serializers.CharField()


class ClockSerializer(serializers.Serializer[None]):
    at = serializers.RegexField(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")


class ResetSerializer(serializers.Serializer[None]):
    as_of = serializers.RegexField(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", required=False)


class PersonaHoldingSerializer(serializers.Serializer[None]):
    position_name = serializers.CharField()
    line = serializers.IntegerField()
    capacity = serializers.CharField()


class PersonaSerializer(serializers.Serializer[None]):
    user_id = serializers.UUIDField()
    nip = serializers.CharField()
    full_name = serializers.CharField()
    active = serializers.BooleanField()
    holdings = PersonaHoldingSerializer(many=True)
    role_views = serializers.ListField(child=serializers.CharField())


class UnregisteredSerializer(serializers.Serializer[None]):
    nip = serializers.CharField()
    full_name = serializers.CharField()


class PersonasSerializer(serializers.Serializer[None]):
    personas = PersonaSerializer(many=True)
    unregistered = UnregisteredSerializer()


class ClockResultSerializer(serializers.Serializer[None]):
    server_now = serializers.CharField()
    ran = serializers.ListField(child=serializers.CharField())


class ResetResultSerializer(serializers.Serializer[None]):
    counts = serializers.DictField(child=serializers.IntegerField())


class PersonasView(DevToolsView):
    """Padanan describe() in the prototype's persona picker (LoginPage.tsx)."""

    @extend_schema(responses=PersonasSerializer, tags=["dev"])
    def get(self, request: Request) -> Response:
        db = load_access_db()
        today = clock.today().isoformat()
        names = {str(p.id): p.name for p in Position.objects.all()}
        codes = {str(r.id): r.code for r in Role.objects.all()}
        personas = []
        for u in User.objects.order_by("full_name"):
            uid = str(u.id)
            views = {codes.get(r) for r in access.effective_role_ids(db, uid, today)}
            personas.append(
                {
                    "user_id": uid,
                    "nip": u.nip,
                    "full_name": u.full_name,
                    "active": u.is_active,
                    "holdings": [
                        {
                            "position_name": names[h["position_id"]],
                            "line": h["line"],
                            "capacity": h["capacity"],
                        }
                        for h in access.holdings_of(db, uid, today)
                    ],
                    "role_views": [v for v in VIEW_ORDER if v in views],
                }
            )
        staff = load_raw()["staffDirectory"][0]
        return Response(
            {
                "personas": personas,
                "unregistered": {"nip": staff["nip"], "full_name": staff["fullName"]},
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class ImpersonateView(DevToolsView):
    """Same rules as the prototype's authApi.signInSso: matched by NIP, never created."""

    authentication_classes: list[type] = []

    @extend_schema(request=NipSerializer, responses=SignInResultSerializer, tags=["dev"])
    def post(self, request: Request) -> Response:
        body = NipSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        nip = body.validated_data["nip"]
        user = User.objects.filter(nip=nip).first()
        if user is None:
            record(action="masuk_ditolak_belum_terdaftar", entity_type="User", entity_id=nip)
            raise ApiError("login_failed", UNREGISTERED)
        if not user.is_active:
            raise ApiError("login_failed", INACTIVE)
        sign_in(request._request, user)
        return Response({"ok": True, "user_id": str(user.id)})


@method_decorator(csrf_protect, name="dispatch")
class ClockView(DevToolsView):
    authentication_classes: list[type] = []

    @extend_schema(request=ClockSerializer, responses=ClockResultSerializer, tags=["dev"])
    def post(self, request: Request) -> Response:
        body = ClockSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        clock.set_now(clock.parse_local(body.validated_data["at"]))
        ran = scheduler.run_all(clock.now())
        return Response({"server_now": clock.now().isoformat(timespec="seconds"), "ran": ran})


@method_decorator(csrf_protect, name="dispatch")
class ResetView(DevToolsView):
    authentication_classes: list[type] = []

    @extend_schema(request=ResetSerializer, responses=ResetResultSerializer, tags=["dev"])
    def post(self, request: Request) -> Response:
        body = ResetSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        as_of = body.validated_data.get("as_of")
        counts = load_demo(clock.parse_local(as_of) if as_of else None)
        logout(request._request)
        return Response({"counts": counts})
