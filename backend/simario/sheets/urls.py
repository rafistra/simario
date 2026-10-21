from django.urls import path

from . import views

urlpatterns = [
    path("positions/<uuid:pk>/sheets/<int:year>/<int:tw>", views.SheetView.as_view(), name="sheet"),
    path(
        "positions/<uuid:pk>/sheets/<int:year>/<int:tw>/print",
        views.PrintView.as_view(),
        name="sheet-print",
    ),
    path(
        "positions/<uuid:pk>/sheet-photos/<str:section>",
        views.PhotosView.as_view(),
        name="sheet-photos",
    ),
    path("snapshots", views.SnapshotSearchView.as_view(), name="snapshots"),
]
