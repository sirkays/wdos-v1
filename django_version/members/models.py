import uuid
from django.db import models
from django.utils import timezone
from core.models import OrgUnit, Profile, NetworkCode


class ApplicationStatus(models.TextChoices):
    SUBMITTED = 'submitted', 'Submitted'
    UNDER_REVIEW = 'under_review', 'Under Review'
    INTERVIEWED = 'interviewed', 'Interviewed'
    RECOMMENDED = 'recommended', 'Recommended'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class Application(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=60)
    last_name = models.CharField(max_length=60)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True, null=True)
    network = models.CharField(max_length=10, choices=NetworkCode.choices)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='applications')
    motivation = models.TextField(blank=True, default='')
    preferred_locale = models.CharField(max_length=5, default='en')
    status = models.CharField(max_length=20, choices=ApplicationStatus.choices, default=ApplicationStatus.SUBMITTED)
    reviewer = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_applications')
    reviewer_notes = models.TextField(blank=True, default='')
    recommended_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='decided_applications')
    decision_reason = models.TextField(blank=True, default='')
    decided_at = models.DateTimeField(null=True, blank=True)
    profile = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='application_records')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'applications'
        ordering = ['-created_at']
        verbose_name = 'Membership Application'
        verbose_name_plural = 'Membership Applications'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.network}) - {self.get_status_display()}"


class Referral(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral_code = models.CharField(max_length=50, unique=True)
    referrer = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='referrals')
    candidate_email = models.EmailField(blank=True, default='')
    candidate_name = models.CharField(max_length=120, blank=True, default='')
    network = models.CharField(max_length=10, choices=NetworkCode.choices)
    views_count = models.PositiveIntegerField(default=0)
    signups_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'referrals'
        ordering = ['-created_at']
        verbose_name = 'Referral Link'
        verbose_name_plural = 'Referral Links'

    def __str__(self):
        return f"{self.referral_code} by {self.referrer.full_name}"


class PositionMailbox(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    position_code = models.CharField(max_length=100, unique=True)
    email_address = models.EmailField(unique=True)
    display_name = models.CharField(max_length=200)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='mailboxes')
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'position_mailboxes'
        ordering = ['position_code']
        verbose_name = 'Position Mailbox'
        verbose_name_plural = 'Position Mailboxes'

    def __str__(self):
        return f"{self.display_name} <{self.email_address}>"
