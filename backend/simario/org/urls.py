from django.urls import path

from . import views

urlpatterns = [
    path("position-types/<uuid:pk>", views.PositionTypeView.as_view(), name="position-type"),
    path("positions", views.PositionListView.as_view(), name="positions"),
    path("positions/<uuid:pk>", views.PositionView.as_view(), name="position"),
    path("positions/<uuid:pk>/impact", views.PositionImpactView.as_view(), name="position-impact"),
    path("positions/<uuid:pk>/workspace", views.WorkspaceView.as_view(), name="workspace"),
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
    path("occupancies", views.OccupancyListView.as_view(), name="occupancies"),
    path(
        "positions/<uuid:pk>/replace-official",
        views.ReplaceOfficialView.as_view(),
        name="position-replace-official",
    ),
    path("positions/<uuid:pk>/filler", views.FillerView.as_view(), name="position-filler"),
    path(
        "positions/<uuid:pk>/delegates",
        views.DelegateListView.as_view(),
        name="position-delegates",
    ),
    path("delegates/<uuid:pk>/revoke", views.DelegateRevokeView.as_view(), name="delegate-revoke"),
    path("me/positions", views.MyPositionsView.as_view(), name="me-positions"),
    path("roles", views.RoleListView.as_view(), name="roles"),
    path("roles/<uuid:pk>", views.RoleView.as_view(), name="role"),
    path(
        "roles/<uuid:pk>/permissions/<int:code>",
        views.RolePermissionView.as_view(),
        name="role-permission",
    ),
    path(
        "monitoring-assignments",
        views.AssignmentListView.as_view(),
        name="monitoring-assignments",
    ),
    path(
        "monitoring-assignments/<uuid:pk>",
        views.AssignmentView.as_view(),
        name="monitoring-assignment",
    ),
]
