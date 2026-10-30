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
    WITHDRAWN = 'withdrawn', 'Withdrawn'


class Application(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=60)
    last_name = models.CharField(max_length=60)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True, null=True)
    age_band = models.CharField(max_length=20, blank=True, default='')
    network = models.CharField(max_length=10, choices=NetworkCode.choices)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='applications')
    role_applied = models.CharField(max_length=64, blank=True, default='')
    referral_code = models.CharField(max_length=64, blank=True, default='')
    referrer_name = models.CharField(max_length=200, blank=True, default='')
    source_category = models.CharField(max_length=50, blank=True, default='online')
    country = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    lga = models.CharField(max_length=100, blank=True, default='')
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

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class Referral(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral_code = models.CharField(max_length=50, unique=True)
    referrer = models.ForeignKey(Profile, on_delete=models.CASCADE, null=True, blank=True, related_name='referrals')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='referral_links')
    role_code = models.CharField(max_length=64, blank=True, default='')
    label = models.CharField(max_length=200, blank=True, default='')
    campaign = models.CharField(max_length=100, blank=True, default='')
    route = models.CharField(max_length=30, default='general')
    is_active = models.BooleanField(default=True)
    candidate_email = models.EmailField(blank=True, default='')
    candidate_name = models.CharField(max_length=120, blank=True, default='')
    candidate_phone = models.CharField(max_length=50, blank=True, default='')
    status = models.CharField(max_length=30, default='submitted')
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
        owner = self.referrer.full_name if self.referrer else 'HQ'
        return f"{self.referral_code} by {owner}"


class PositionMailbox(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    position_code = models.CharField(max_length=100, unique=True)
    email_address = models.EmailField(unique=True)
    display_name = models.CharField(max_length=200)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='mailboxes')
    role = models.CharField(max_length=50, blank=True, default='')
    holder = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='held_mailboxes')
    country_iso = models.CharField(max_length=4, blank=True, default='')
    level = models.IntegerField(default=0)
    network = models.CharField(max_length=10, default='WGMN')
    password_plain = models.CharField(max_length=120, blank=True, default='WoddiMail2026!')
    webmail_url = models.CharField(max_length=255, default='https://9.qservers.net:2096/')
    is_unlocked = models.BooleanField(default=False)
    reveal_count = models.PositiveIntegerField(default=0)
    last_revealed_at = models.DateTimeField(null=True, blank=True)
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
