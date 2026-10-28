from django.conf import settings
from django.db import models


class OnboardingProgress(models.Model):
    """One finished step per leader, with the evidence (Phase 184)."""
    profile = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='onboarding_progress')
    step_code = models.CharField(max_length=40)
    done_at = models.DateTimeField(auto_now_add=True)
    seconds_spent = models.PositiveIntegerField(default=0)
    reached_end = models.BooleanField(default=False)
    mode = models.CharField(max_length=10, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        unique_together = ('profile', 'step_code')
        verbose_name = 'Onboarding Progress'
        verbose_name_plural = 'Onboarding Progress Records'
