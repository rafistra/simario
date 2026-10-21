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
]
