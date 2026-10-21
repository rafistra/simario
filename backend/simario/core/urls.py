from django.urls import path

from . import views
from .collection_views import CollectionView

urlpatterns = [
    path("health", views.health, name="health"),
    path("health/live", views.health_live, name="health-live"),
    path("collections/<str:name>", CollectionView.as_view(), name="collection"),
]
