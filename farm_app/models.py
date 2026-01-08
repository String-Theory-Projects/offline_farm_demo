from django.db import models
from django.contrib.auth.models import User


class Farm(models.Model):
    """Represents a farm or plantation"""
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['-created_at']


class Tree(models.Model):
    """Represents an individual palm/tree with unique QR identifier"""
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='trees')
    tree_id = models.CharField(max_length=50, unique=True, help_text="Unique identifier for QR code (e.g., TREE-001)")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tree_id} - {self.farm.name}"

    class Meta:
        ordering = ['tree_id']


class Activity(models.Model):
    """Records field activities: fertilizer, pruning, harvesting, other"""
    ACTIVITY_TYPES = [
        ('fertilizer', 'Fertilizer Application'),
        ('pruning', 'Pruning'),
        ('harvesting', 'Harvesting'),
        ('other', 'Other'),
    ]

    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name='activities')
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    date = models.DateField()
    notes = models.TextField(blank=True)
    quantity = models.CharField(max_length=100, blank=True, help_text="Quantity/amount (e.g., '5kg', '10 bags')")
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # For custom "other" activities
    custom_type = models.CharField(max_length=255, blank=True, help_text="Custom activity type if 'other' is selected")

    def __str__(self):
        activity_display = self.custom_type if self.activity_type == 'other' and self.custom_type else self.get_activity_type_display()
        return f"{activity_display} - {self.tree.tree_id} - {self.date}"

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name_plural = 'Activities'

