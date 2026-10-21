from django.urls import path

from . import views

urlpatterns = [
    path("registers/<uuid:pk>/<int:year>", views.RegisterView.as_view(), name="register"),
]
