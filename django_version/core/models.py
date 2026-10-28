import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone


class OrgLevel(models.TextChoices):
    HEADQUARTERS = 'headquarters', 'Headquarters'
    COUNTRY = 'country', 'Country'
    STATE_REGION = 'state_region', 'State / Region'
    DISTRICT_LGA = 'district_lga', 'District / LGA'
    CHAPTER = 'chapter', 'Chapter'


class RoleCode(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Administrator'
    EXECUTIVE_DIRECTOR = 'executive_director', 'Executive Director'
    HQ_TEAM = 'hq_team', 'HQ Team'
    COUNTRY_REP = 'country_rep', 'Country Representative'
    DEPUTY_COUNTRY_REP = 'deputy_country_rep', 'Deputy Country Representative'
    STATE_COORDINATOR = 'state_coordinator', 'State Coordinator'
    ASSISTANT_STATE_COORDINATOR = 'assistant_state_coordinator', 'Assistant State Coordinator'
    DISTRICT_COORDINATOR = 'district_coordinator', 'District / LGA Coordinator'
    CHAPTER_LEAD = 'chapter_lead', 'Chapter Lead'
    VOLUNTEER = 'volunteer', 'Volunteer'
    MEMBER = 'member', 'Member'
    PROGRAMME_STAFF = 'programme_staff', 'Programme Staff'
    INSTITUTE_ADMIN = 'institute_admin', 'Institute Administrator'
    DONOR = 'donor', 'Donor'
    EXTERNAL_PARTNER = 'external_partner', 'External Partner'


class NetworkCode(models.TextChoices):
    WGMN = 'WGMN', 'Good Mother Network (WGMN, 30+)'
    WNNN = 'WNNN', 'Nurture NextGen Network (WNNN, 18-29)'


class MemberStatus(models.TextChoices):
    APPLICANT = 'applicant', 'Applicant'
    UNDER_REVIEW = 'under_review', 'Under Review'
    APPROVED = 'approved', 'Approved'
    ACTIVATED = 'activated', 'Activated'
    IN_TRAINING = 'in_training', 'In Training'
    ACTIVE = 'active', 'Active'
    INACTIVE = 'inactive', 'Inactive'
    SUSPENDED = 'suspended', 'Suspended'
    RESIGNED = 'resigned', 'Resigned'
    REMOVED = 'removed', 'Removed'
    ALUMNI = 'alumni', 'Alumni'
    REINSTATED = 'reinstated', 'Reinstated'


class OrgUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(
        'self',
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name='children'
    )
    level = models.CharField(max_length=30, choices=OrgLevel.choices)
    name = models.CharField(max_length=120)
    country_iso = models.CharField(max_length=2, blank=True, default='')
    is_active = models.BooleanField(default=True)
    subregion = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'org_units'
        ordering = ['name']
        verbose_name = 'Organisational Unit'
        verbose_name_plural = 'Organisational Units'

    def __str__(self):
        return f"{self.name} ({self.get_level_display()})"

    def subtree_ids(self):
        """Returns all descendant unit ids including self."""
        result = [self.id]
        to_visit = [self.id]
        while to_visit:
            curr = to_visit.pop(0)
            child_ids = list(OrgUnit.objects.filter(parent_id=curr).values_list('id', flat=True))
            result.extend(child_ids)
            to_visit.extend(child_ids)
        return result

    def get_ancestors(self):
        """Returns list of ancestor OrgUnits up to root."""
        ancestors = []
        curr = self.parent
        while curr is not None:
            ancestors.append(curr)
            curr = curr.parent
        return ancestors

    def full_path(self):
        ancestors = self.get_ancestors()
        ancestors.reverse()
        names = [a.name for a in ancestors] + [self.name]
        return " > ".join(names)


class ProfileManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email).lower()
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('status', MemberStatus.ACTIVE)
        extra_fields.setdefault('first_name', 'Super')
        extra_fields.setdefault('last_name', 'Admin')
        return self.create_user(email, password, **extra_fields)


class Profile(AbstractBaseUser, PermissionsMixin):
    LOCALE_CHOICES = [
        ('en', 'English'),
        ('fr', 'Français'),
        ('pt', 'Português'),
        ('ar', 'العربية'),
        ('sw', 'Kiswahili'),
        ('ha', 'Hausa'),
        ('yo', 'Yorùbá'),
        ('ig', 'Igbo'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    membership_no = models.CharField(max_length=50, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=60)
    last_name = models.CharField(max_length=60)
    phone = models.CharField(max_length=40, blank=True, null=True)
    network = models.CharField(max_length=10, choices=NetworkCode.choices, default=NetworkCode.WGMN)
    status = models.CharField(max_length=20, choices=MemberStatus.choices, default=MemberStatus.APPLICANT)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, null=True, blank=True, related_name='members')
    preferred_locale = models.CharField(max_length=5, choices=LOCALE_CHOICES, default='en')
    birth_date = models.DateField(null=True, blank=True)
    is_leader = models.BooleanField(default=False)
    hq_function = models.CharField(max_length=50, null=True, blank=True)
    avatar = models.CharField(max_length=255, blank=True, default='')
    country = models.CharField(max_length=100, blank=True, default='')
    state_region = models.CharField(max_length=100, blank=True, default='')
    lga = models.CharField(max_length=100, blank=True, default='')
    role_applied = models.CharField(max_length=100, blank=True, default='')
    merged_into = models.UUIDField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Django user flags
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProfileManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        db_table = 'profiles'
        ordering = ['last_name', 'first_name']
        verbose_name = 'Profile'
        verbose_name_plural = 'Profiles'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_roles(self):
        return self.roles.filter(ends_at__isnull=True).select_related('org_unit')

    def is_in_hq(self):
        return bool(self.is_superuser or self.hq_function or self.roles.filter(
            ends_at__isnull=True,
            role__in=[RoleCode.SUPER_ADMIN, RoleCode.EXECUTIVE_DIRECTOR, RoleCode.HQ_TEAM]
        ).exists())


class RoleAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='roles')
    role = models.CharField(max_length=35, choices=RoleCode.choices)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='role_assignments')
    assigned_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_roles')
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'role_assignments'
        ordering = ['-starts_at']
        verbose_name = 'Role Assignment'
        verbose_name_plural = 'Role Assignments'

    def __str__(self):
        return f"{self.profile.full_name} -> {self.get_role_display()} at {self.org_unit.name}"


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_actions')
    action = models.CharField(max_length=50)
    table_name = models.CharField(max_length=100)
    record_id = models.CharField(max_length=100)
    old_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'audit_log'
        ordering = ['-occurred_at']
        verbose_name = 'Audit Log Entry'
        verbose_name_plural = 'Audit Log'

    def __str__(self):
        return f"{self.action} on {self.table_name} [{self.record_id}] at {self.occurred_at.strftime('%Y-%m-%d %H:%M')}"


class OrgSetting(models.Model):
    key = models.CharField(max_length=100, unique=True, primary_key=True)
    value = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'org_settings'
        verbose_name = 'Organisation Setting'
        verbose_name_plural = 'Organisation Settings'

    def __str__(self):
        return self.key


class Department(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments'
        verbose_name = 'HQ Department'
        verbose_name_plural = 'HQ Departments'

    def __str__(self):
        return self.name


class Staff(models.Model):
    profile = models.OneToOneField(Profile, primary_key=True, on_delete=models.CASCADE, related_name='staff_record')
    department = models.ForeignKey(Department, on_delete=models.RESTRICT, related_name='staff_members')
    position_title = models.CharField(max_length=120)
    reports_to = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='direct_reports')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff'
        verbose_name = 'HQ Staff Member'
        verbose_name_plural = 'HQ Staff Roster'

    def __str__(self):
        return f"{self.profile.full_name} — {self.position_title} ({self.department.name})"


class ModuleAccess(models.Model):
    role = models.CharField(max_length=35, choices=RoleCode.choices)
    module = models.CharField(max_length=50)

    class Meta:
        db_table = 'module_access'
        unique_together = ('role', 'module')
        verbose_name = 'Module Access Rule'
        verbose_name_plural = 'Module Access Matrix'

    def __str__(self):
        return f"{self.role} -> {self.module}"
