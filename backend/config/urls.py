from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("oidc/", include("mozilla_django_oidc.urls")),
    path("api/v1/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/", include("simario.core.urls")),
    path("api/v1/", include("simario.accounts.urls")),
    path("api/v1/", include("simario.notifications.urls")),
    path("api/v1/", include("simario.devtools.urls")),
    path("api/v1/", include("simario.org.urls")),
    path("api/v1/", include("simario.reference.urls")),
    path("api/v1/", include("simario.calendar.urls")),
    path("api/v1/", include("simario.imports.urls")),
]

if settings.DEBUG:
    urlpatterns.append(
        path("api/v1/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs")
    )
