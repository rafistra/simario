from django.urls import path

from . import views

urlpatterns = [
    path("imports", views.ImportListView.as_view(), name="imports"),
    path("imports/kinds", views.ImportKindsView.as_view(), name="import-kinds"),
    path(
        "imports/templates/<str:kind>", views.ImportTemplateView.as_view(), name="import-template"
    ),
    path("imports/<uuid:pk>/commit", views.ImportCommitView.as_view(), name="import-commit"),
]
