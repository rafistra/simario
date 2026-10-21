from django.urls import path

from . import views

urlpatterns = [
    path("fiscal-years", views.FiscalYearListView.as_view(), name="fiscal-years"),
    path("fiscal-years/<int:year>", views.FiscalYearView.as_view(), name="fiscal-year"),
    path(
        "fiscal-years/<int:year>/archive", views.ArchiveView.as_view(), name="fiscal-year-archive"
    ),
    path(
        "fiscal-years/<int:year>/archive-status",
        views.ArchiveStatusView.as_view(),
        name="fiscal-year-archive-status",
    ),
    path("quarters/<uuid:pk>", views.QuarterView.as_view(), name="quarter"),
    path(
        "quarters/<uuid:pk>/assessors/<uuid:position_id>/exclude",
        views.ExcludeAssessorView.as_view(),
        name="quarter-assessor-exclude",
    ),
]
