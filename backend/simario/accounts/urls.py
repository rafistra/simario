from django.urls import path

from . import admin_views, preferences, views

urlpatterns = [
    path("auth/config", views.AuthConfigView.as_view(), name="auth-config"),
    path("auth/login", views.LocalLoginView.as_view(), name="auth-login"),
    path("auth/password", views.PasswordView.as_view(), name="auth-password"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("me", views.MeView.as_view(), name="me"),
    path("preferences", preferences.PreferenceListView.as_view(), name="preferences"),
    path("preferences/<str:key>", preferences.PreferenceView.as_view(), name="preference"),
    path("me/active-position", views.ActivePositionView.as_view(), name="me-active-position"),
    path("users", admin_views.UserListView.as_view(), name="users"),
    path("users/<uuid:pk>/roles", admin_views.UserRolesView.as_view(), name="user-roles"),
    path(
        "users/<uuid:pk>/deactivate",
        admin_views.UserDeactivateView.as_view(),
        name="user-deactivate",
    ),
    path(
        "users/<uuid:pk>/reactivate",
        admin_views.UserReactivateView.as_view(),
        name="user-reactivate",
    ),
    path(
        "users/<uuid:pk>/reset-password",
        admin_views.UserResetPasswordView.as_view(),
        name="user-reset-password",
    ),
    path("staff", admin_views.StaffSearchView.as_view(), name="staff"),
]
