from django.urls import path

from . import views

urlpatterns = [
    path("stages", views.StageListView.as_view(), name="stages"),
    path("stages/<uuid:pk>", views.StageView.as_view(), name="stage"),
    path(
        "position-types/<uuid:pk>/stage-order",
        views.StageOrderView.as_view(),
        name="stage-order",
    ),
    path("risk-templates", views.TemplateListView.as_view(), name="risk-templates"),
    path("risk-templates/usage", views.TemplateUsageView.as_view(), name="risk-template-usage"),
    path("master-usage", views.MasterUsageView.as_view(), name="master-usage"),
    path("risk-templates/<uuid:pk>", views.TemplateView.as_view(), name="risk-template"),
    path(
        "position-types/<uuid:pk>/data-umum-forms",
        views.DataUmumFormView.as_view(),
        name="data-umum-forms",
    ),
    path("score-band-versions", views.BandVersionListView.as_view(), name="band-versions"),
    path("score-band-versions/<uuid:pk>", views.BandVersionView.as_view(), name="band-version"),
    path(
        "score-band-versions/<uuid:pk>/schedule",
        views.BandVersionScheduleView.as_view(),
        name="band-version-schedule",
    ),
    path("score-bands/<str:predicate>", views.ActiveGuidanceView.as_view(), name="band-guidance"),
    path("score-options/<uuid:pk>", views.OptionLabelView.as_view(), name="score-option"),
    path("proposals", views.ProposalListView.as_view(), name="proposals"),
    path("proposals/<uuid:pk>/reject", views.ProposalRejectView.as_view(), name="proposal-reject"),
    path("proposals/<uuid:pk>/accept", views.ProposalAcceptView.as_view(), name="proposal-accept"),
]
