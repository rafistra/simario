from django.urls import path

from . import views

urlpatterns = [
    path("home", views.HomeView.as_view(), name="home"),
    path("my-positions", views.MyPositionsView.as_view(), name="my-positions"),
]
