from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('scan/', views.scan_view, name='scan'),
    path('api/sync/', views.sync_activities, name='sync_activities'),
    path('api/tree/<str:tree_id>/', views.get_tree_info, name='get_tree_info'),
    path('api/synced-activities/', views.get_synced_activities, name='get_synced_activities'),
]

