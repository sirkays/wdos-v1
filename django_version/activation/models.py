from django.conf import settings
from django.db import models


class CandidateActivation(models.Model):
    """One per person per route. ref3 = referred (3 days), open7 = open call (7 days)."""
    ROUTES = [('ref3', '3-Day referral'), ('open7', '7-Day open call')]
    STATUSES = [('not_started', 'Not Started'), ('in_progress', 'In Progress'), ('incomplete', 'Incomplete'), ('completed', 'Completed')]
    profile = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='activations')
    route = models.CharField(max_length=6, choices=ROUTES, default='ref3')
    network = models.CharField(max_length=10, blank=True)
    role = models.CharField(max_length=120, blank=True)
    referral_code = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default='not_started')
    started_at = models.DateTimeField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    extension_status = models.CharField(max_length=10, blank=True)   # requested | approved | declined
    extension_reason = models.TextField(blank=True)
    outcome = models.CharField(max_length=20, blank=True)           # set by HQ: selected, reserve, ...
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('profile', 'route')


class ActivationStep(models.Model):
    activation = models.ForeignKey(CandidateActivation, on_delete=models.CASCADE, related_name='steps')
    day = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=12, default='in_progress')   # in_progress | completed
    answers = models.JSONField(default=dict)
    acks = models.JSONField(default=list)
    reached_end = models.BooleanField(default=False)
    seconds_spent = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('activation', 'day')


class ReadinessAssessment(models.Model):
    """The 13-question assessment. Submitted answers lock; a return makes a new version and keeps the old."""
    activation = models.OneToOneField(CandidateActivation, on_delete=models.CASCADE, related_name='assessment')
    answers = models.JSONField(default=dict)
    status = models.CharField(max_length=10, default='pending')   # pending | submitted | returned | completed
    submitted_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveSmallIntegerField(default=1)
    previous = models.JSONField(default=list)
    scores = models.JSONField(default=dict)       # internal, never shown to the candidate
    return_note = models.TextField(blank=True)
