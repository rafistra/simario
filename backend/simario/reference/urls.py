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
    path("risk-templates/<uuid:pk>", views.TemplateView.as_view(), name="risk-template"),
    path(
        "position-types/<uuid:pk>/data-umum-forms",
        views.DataUmumFormView.as_view(),
        name="data-umum-forms",
    ),
]
