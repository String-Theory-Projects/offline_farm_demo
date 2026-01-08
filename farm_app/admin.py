from django.contrib import admin
from .models import Farm, Tree, Activity


@admin.register(Farm)
class FarmAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'created_by', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name', 'location']


@admin.register(Tree)
class TreeAdmin(admin.ModelAdmin):
    list_display = ['tree_id', 'farm', 'created_at']
    list_filter = ['farm', 'created_at']
    search_fields = ['tree_id', 'farm__name']


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ['activity_type', 'tree', 'date', 'recorded_by', 'created_at']
    list_filter = ['activity_type', 'date', 'created_at']
    search_fields = ['tree__tree_id', 'notes', 'custom_type']
    date_hierarchy = 'date'

