from django.urls import path

from . import views

urlpatterns = [
    path("auth/config", views.AuthConfigView.as_view(), name="auth-config"),
    path("auth/login", views.LocalLoginView.as_view(), name="auth-login"),
    path("auth/password", views.PasswordView.as_view(), name="auth-password"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
]
