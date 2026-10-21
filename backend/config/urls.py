from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/", include("simario.core.urls")),
]

if settings.DEBUG:
    urlpatterns.append(
        path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs")
    )
