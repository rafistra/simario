from django.urls import path

from . import views

urlpatterns = [
    path(
        "positions/<uuid:pk>/assessments/<int:year>/<int:tw>",
        views.AssessmentPageView.as_view(),
        name="assessment-page",
    ),
    path(
        "positions/<uuid:pk>/assessments/<int:year>/<int:tw>/finalise-preview",
        views.FinalisePreviewView.as_view(),
        name="assessment-finalise-preview",
    ),
    path("assessment-queue", views.QueueView.as_view(), name="assessment-queue"),
    path("positions/<uuid:pk>/history/<int:year>", views.HistoryView.as_view(), name="history"),
    path(
        "risk-quarters/<uuid:pk>/assessments/<uuid:assessor>",
        views.CellView.as_view(),
        name="assessment-cell",
    ),
    path(
        "risk-quarters/<uuid:pk>/assessments/<uuid:assessor>/files",
        views.EvidenceView.as_view(),
        name="assessment-files",
    ),
    path("assessment-files/<uuid:pk>", views.EvidenceFileView.as_view(), name="assessment-file"),
    path(
        "positions/<uuid:pk>/quarters/<uuid:quarter>/assessments/<uuid:assessor>/ready",
        views.ReadyView.as_view(),
        name="assessment-ready",
    ),
    path(
        "positions/<uuid:pk>/quarters/<uuid:quarter>/assessments/<uuid:assessor>/finalise",
        views.FinaliseView.as_view(),
        name="assessment-finalise",
    ),
    path("assessments/<uuid:pk>/reopen", views.ReopenView.as_view(), name="assessment-reopen"),
    path("results/<uuid:pk>/explanation", views.ExplanationView.as_view(), name="explanation"),
    path(
        "positions/<uuid:pk>/explanations/ready",
        views.ExplanationsReadyView.as_view(),
        name="explanations-ready",
    ),
    path(
        "positions/<uuid:pk>/explanations/send",
        views.ExplanationsSendView.as_view(),
        name="explanations-send",
    ),
]
