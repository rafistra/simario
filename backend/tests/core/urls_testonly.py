from django.http import HttpRequest, HttpResponse
from django.urls import path
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from simario.core.errors import ApiError
from simario.core.pagination import PagePagination


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def archived(request: Request) -> Response:
    raise ApiError("archived", "Tahun anggaran sudah diarsipkan.")


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def invalid(request: Request) -> Response:
    raise ValidationError({"fiscal_year": ["wajib"]})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def boom(request: Request) -> Response:
    raise RuntimeError("secret detail")


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([])
def echo(request: Request) -> Response:
    if request.method == "POST":
        assert isinstance(request.data, dict)
        return Response({"received_fiscal_year": request.data.get("fiscal_year")})
    return Response({"fiscal_year": 2027})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def items(request: Request) -> Response:
    paginator = PagePagination()
    page = paginator.paginate_queryset(list(range(30)), request)
    return paginator.get_paginated_response(page)


urlpatterns = [
    path("api/v1/archived", archived),
    path("api/v1/invalid", invalid),
    path("api/v1/boom", boom),
    path("api/v1/echo", echo),
    path("api/v1/items", items),
]


def plain_html_error(request: HttpRequest) -> HttpResponse:
    """Stands in for HTML errors produced outside DRF (middleware, Django internals)."""
    return HttpResponse("<h1>Server Error</h1>", status=500, content_type="text/html")


urlpatterns.append(path("api/v1/plain-html-error", plain_html_error))
