from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.db import transaction
import json
from datetime import datetime

from .models import Farm, Tree, Activity


def dashboard(request):
    """Main dashboard showing synced and pending activities"""
    # Get all synced activities from database
    synced_activities = Activity.objects.select_related('tree', 'tree__farm').all()[:100]
    
    context = {
        'synced_activities': synced_activities,
        'farms': Farm.objects.all(),
    }
    return render(request, 'farm_app/dashboard.html', context)


def scan_view(request):
    """QR scan and activity capture page"""
    farms = Farm.objects.all()
    context = {
        'farms': farms,
    }
    return render(request, 'farm_app/scan.html', context)


@csrf_exempt
@require_http_methods(["POST"])
def sync_activities(request):
    """Sync pending activities from localStorage to database"""
    try:
        data = json.loads(request.body)
        pending_activities = data.get('activities', [])
        
        synced_count = 0
        errors = []
        
        with transaction.atomic():
            for activity_data in pending_activities:
                try:
                    tree_id = activity_data.get('tree_id')
                    tree = get_object_or_404(Tree, tree_id=tree_id)
                    
                    # Parse date
                    activity_date = datetime.strptime(activity_data.get('date'), '%Y-%m-%d').date()
                    
                    Activity.objects.create(
                        tree=tree,
                        activity_type=activity_data.get('activity_type'),
                        date=activity_date,
                        notes=activity_data.get('notes', ''),
                        quantity=activity_data.get('quantity', ''),
                        custom_type=activity_data.get('custom_type', ''),
                        recorded_by=None,
                    )
                    synced_count += 1
                except Exception as e:
                    errors.append(f"Error syncing activity for {activity_data.get('tree_id', 'unknown')}: {str(e)}")
        
        return JsonResponse({
            'success': True,
            'synced_count': synced_count,
            'errors': errors
        })
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@require_http_methods(["GET"])
def get_tree_info(request, tree_id):
    """Get tree information by tree_id"""
    try:
        tree = Tree.objects.select_related('farm').get(tree_id=tree_id)
        return JsonResponse({
            'tree_id': tree.tree_id,
            'farm_name': tree.farm.name,
            'farm_id': tree.farm.id,
        })
    except Tree.DoesNotExist:
        return JsonResponse({'error': 'Tree not found'}, status=404)


@require_http_methods(["GET"])
def get_synced_activities(request):
    """Get synced activities as JSON for caching"""
    activities = Activity.objects.select_related('tree', 'tree__farm').all()[:100]
    activities_data = []
    for activity in activities:
        activities_data.append({
            'id': activity.id,
            'tree_id': activity.tree.tree_id,
            'farm_name': activity.tree.farm.name,
            'activity_type': activity.activity_type,
            'custom_type': activity.custom_type,
            'date': str(activity.date),
            'quantity': activity.quantity,
            'notes': activity.notes,
            'created_at': activity.created_at.isoformat() if activity.created_at else None,
        })
    return JsonResponse({'activities': activities_data})


@require_http_methods(["GET"])
def get_all_trees(request):
    """Get all trees as JSON for offline caching"""
    trees = Tree.objects.select_related('farm').all()
    trees_data = []
    for tree in trees:
        trees_data.append({
            'tree_id': tree.tree_id,
            'farm_name': tree.farm.name,
            'farm_id': tree.farm.id,
        })
    return JsonResponse({'trees': trees_data})

