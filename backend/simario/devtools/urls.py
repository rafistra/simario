from django.urls import path

from . import views

urlpatterns = [
    path("dev/personas", views.PersonasView.as_view(), name="dev-personas"),
    path("dev/impersonate", views.ImpersonateView.as_view(), name="dev-impersonate"),
    path("dev/clock", views.ClockView.as_view(), name="dev-clock"),
    path("dev/reset", views.ResetView.as_view(), name="dev-reset"),
]
