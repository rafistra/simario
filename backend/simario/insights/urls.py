from django.urls import path

from . import views

urlpatterns = [
    path("metrics/<int:year>", views.MetricsView.as_view(), name="metrics"),
    path("metrics/<int:year>.csv", views.MetricsCsvView.as_view(), name="metrics-csv"),
    path("audit", views.AuditView.as_view(), name="audit"),
    path("audit/facets", views.AuditFacetsView.as_view(), name="audit-facets"),
]
