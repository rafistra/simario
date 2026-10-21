from django.urls import path

from . import views

R = "registers/<uuid:pk>/<int:year>"

urlpatterns = [
    path(R, views.RegisterView.as_view(), name="register"),
    path(
        f"{R}/template-risks/<uuid:template_id>",
        views.TemplateRiskView.as_view(),
        name="register-template-risk",
    ),
    path(f"{R}/risks", views.CustomRiskView.as_view(), name="register-risks"),
    path(f"{R}/declarations", views.DeclarationView.as_view(), name="register-declarations"),
    path(f"{R}/mark-ready", views.MarkReadyView.as_view(), name="register-mark-ready"),
    path(f"{R}/publish", views.PublishView.as_view(), name="register-publish"),
    path(f"{R}/copy-from-previous", views.CopyView.as_view(), name="register-copy"),
    path("register-risks/<uuid:pk>", views.RiskView.as_view(), name="register-risk"),
    path(
        "register-risks/<uuid:pk>/template-mitigations/<uuid:template_id>",
        views.TemplateMitigationView.as_view(),
        name="register-template-mitigation",
    ),
    path(
        "register-risks/<uuid:pk>/mitigations",
        views.CustomMitigationView.as_view(),
        name="register-mitigations",
    ),
    path(
        "register-risks/<uuid:pk>/deactivate",
        views.RiskDeactivateView.as_view(),
        name="register-risk-deactivate",
    ),
    path("register-mitigations/<uuid:pk>", views.MitigationView.as_view(), name="mitigation"),
    path(
        "register-mitigations/<uuid:pk>/deactivate",
        views.MitigationDeactivateView.as_view(),
        name="mitigation-deactivate",
    ),
]
