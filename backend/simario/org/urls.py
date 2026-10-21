from django.urls import path

from . import views

urlpatterns = [
    path("position-types/<uuid:pk>", views.PositionTypeView.as_view(), name="position-type"),
    path("positions", views.PositionListView.as_view(), name="positions"),
    path("positions/<uuid:pk>", views.PositionView.as_view(), name="position"),
    path("positions/<uuid:pk>/impact", views.PositionImpactView.as_view(), name="position-impact"),
    path(
        "positions/<uuid:pk>/deactivate",
        views.PositionDeactivateView.as_view(),
        name="position-deactivate",
    ),
    path(
        "positions/<uuid:pk>/reactivate",
        views.PositionReactivateView.as_view(),
        name="position-reactivate",
    ),
]
