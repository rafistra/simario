from django.urls import path

from . import views

urlpatterns = [
    path("positions/<uuid:pk>/board/<int:year>", views.BoardView.as_view(), name="board"),
    path("register-risks/<uuid:pk>/thread", views.ThreadView.as_view(), name="thread"),
    path(
        "register-risks/<uuid:pk>/participants",
        views.ParticipantsView.as_view(),
        name="thread-participants",
    ),
]
