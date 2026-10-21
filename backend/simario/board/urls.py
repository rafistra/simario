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
    path("register-risks/<uuid:pk>/comments", views.CommentListView.as_view(), name="comments"),
    path(
        "register-risks/<uuid:pk>/subscription",
        views.SubscriptionView.as_view(),
        name="thread-subscription",
    ),
    path("register-risks/<uuid:pk>/seen", views.SeenView.as_view(), name="thread-seen"),
    path("comments/<uuid:pk>", views.CommentView.as_view(), name="comment"),
    path("comments/<uuid:pk>/withdraw", views.CommentWithdrawView.as_view(), name="withdraw"),
    path("attachments/<uuid:pk>", views.AttachmentView.as_view(), name="attachment"),
    path(
        "attachments/<uuid:pk>/download",
        views.AttachmentDownloadView.as_view(),
        name="attachment-download",
    ),
]
