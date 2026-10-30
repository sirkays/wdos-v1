import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone


class OrgLevel(models.TextChoices):
    HEADQUARTERS = 'headquarters', 'Headquarters'
    COUNTRY = 'country', 'Country'
    STATE_REGION = 'state_region', 'State / Region'
    DISTRICT_LGA = 'district_lga', 'District / LGA'
    COMMUNITY_CLUSTER = 'community_cluster', 'Community Cluster'
    CHAPTER = 'chapter', 'Chapter'


class RoleCode(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Administrator'
    EXECUTIVE_DIRECTOR = 'executive_director', 'Executive Director'
    HQ_TEAM = 'hq_team', 'HQ Team'
    COUNTRY_REP = 'country_rep', 'Country Representative'
    DEPUTY_COUNTRY_REP = 'deputy_country_rep', 'Deputy Country Representative'
    STATE_COORDINATOR = 'state_coordinator', 'State Coordinator'
    ASSISTANT_STATE_COORDINATOR = 'assistant_state_coordinator', 'Assistant State Coordinator'
    STATE_SECRETARY = 'state_secretary', 'State / Regional Secretary'
    DISTRICT_COORDINATOR = 'district_coordinator', 'District / LGA Coordinator'
    ASSISTANT_DISTRICT_COORDINATOR = 'assistant_district_coordinator', 'Assistant District / LGA Coordinator'
    LGA_COORDINATOR = 'lga_coordinator', 'LGA / District Coordinator'
    ASSISTANT_LGA_COORDINATOR = 'assistant_lga_coordinator', 'Assistant LGA / District Coordinator'
    LGA_SECRETARY = 'lga_secretary', 'LGA / District Secretary'
    WARD_COORDINATOR = 'ward_coordinator', 'Community Cluster / Ward Coordinator'
    ASSISTANT_WARD_COORDINATOR = 'assistant_ward_coordinator', 'Assistant Community Cluster / Ward Coordinator'
    WARD_SECRETARY = 'ward_secretary', 'Community Cluster / Ward Secretary'
    CLUSTER_COORDINATOR = 'cluster_coordinator', 'Community Cluster Coordinator'
    ASSISTANT_CLUSTER_COORDINATOR = 'assistant_cluster_coordinator', 'Assistant Community Cluster Coordinator'
    CHAPTER_LEAD = 'chapter_lead', 'Chapter Lead'
    ASSISTANT_CHAPTER_LEAD = 'assistant_chapter_lead', 'Assistant Chapter Lead'
    CHAPTER_COORDINATOR = 'chapter_coordinator', 'Chapter Coordinator'
    ASSISTANT_CHAPTER_COORDINATOR = 'assistant_chapter_coordinator', 'Assistant Chapter Coordinator'
    CHAPTER_SECRETARY = 'chapter_secretary', 'Chapter Secretary'
    VOLUNTEER = 'volunteer', 'Volunteer'
    MEMBER = 'member', 'Member'
    PROGRAMME_STAFF = 'programme_staff', 'Programme Staff'
    INSTITUTE_ADMIN = 'institute_admin', 'Institute Administrator'
    DONOR = 'donor', 'Donor'
    EXTERNAL_PARTNER = 'external_partner', 'External Partner'


WNNN_ROLE_TITLES = {
    'country_rep': 'Country Lead',
    'deputy_country_rep': 'Deputy Country Lead',
    'state_coordinator': 'State / Regional Lead',
    'assistant_state_coordinator': 'Deputy State / Regional Lead',
    'state_secretary': 'State / Regional Secretary',
    'district_coordinator': 'LGA / District Lead',
    'assistant_district_coordinator': 'Assistant LGA / District Lead',
    'lga_coordinator': 'LGA / District Lead',
    'assistant_lga_coordinator': 'Deputy LGA / District Lead',
    'lga_secretary': 'LGA / District Secretary',
    'ward_coordinator': 'Community Cluster Lead',
    'assistant_ward_coordinator': 'Deputy Community Cluster Lead',
    'ward_secretary': 'Community Cluster Secretary',
    'cluster_coordinator': 'Community Cluster Lead',
    'assistant_cluster_coordinator': 'Assistant Community Cluster Lead',
    'chapter_lead': 'Chapter Lead',
    'assistant_chapter_lead': 'Assistant Chapter Lead',
    'chapter_coordinator': 'Chapter Lead',
    'assistant_chapter_coordinator': 'Deputy Chapter Lead',
    'chapter_secretary': 'Chapter Secretary',
}

WGMN_ROLE_TITLES = {
    'chapter_lead': 'Chapter Coordinator',
    'assistant_chapter_lead': 'Assistant Chapter Coordinator',
}


def get_role_title(role_code, network='WGMN'):
    if not role_code:
        return ''
    if network == 'WNNN' and role_code in WNNN_ROLE_TITLES:
        return WNNN_ROLE_TITLES[role_code]
    if network == 'WGMN' and role_code in WGMN_ROLE_TITLES:
        return WGMN_ROLE_TITLES[role_code]
    try:
        return RoleCode(role_code).label
    except ValueError:
        return str(role_code).replace('_', ' ').title()


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
    network = models.CharField(max_length=10, choices=NetworkCode.choices, blank=True, default='')
    is_active = models.BooleanField(default=True)
    subregion = models.CharField(max_length=100, blank=True, default='')
    level_2_name = models.CharField(max_length=80, blank=True, default='State / Region')
    level_3_name = models.CharField(max_length=80, blank=True, default='LGA / District')
    level_4_name = models.CharField(max_length=80, blank=True, default='Community Cluster / Ward')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'org_units'
        ordering = ['name']
        verbose_name = 'Organisational Unit'
        verbose_name_plural = 'Organisational Units'

    def __str__(self):
        return f"{self.name} ({self.get_level_display()})"

    @property
    def code(self):
        return f"{self.country_iso or 'WDOS'}-{str(self.id)[:4].upper()}"

    @property
    def country(self):
        return self.country_iso or self.name

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
    whatsapp = models.CharField(max_length=50, blank=True, default='')
    volunteer_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    bio = models.TextField(blank=True, default='')
    referral_code = models.CharField(max_length=64, blank=True, default='')
    is_suspended = models.BooleanField(default=False)
    engagement_stage = models.CharField(max_length=32, blank=True, default='active')
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

    @property
    def state(self):
        return self.state_region

    @property
    def city(self):
        return self.lga

    @city.setter
    def city(self, val):
        self.lga = val or ''

    @property
    def profession(self):
        return self.role_applied

    @profession.setter
    def profession(self, val):
        self.role_applied = val or ''

    @property
    def skills(self):
        return []

    def get_roles(self):
        return self.roles.filter(ends_at__isnull=True).select_related('org_unit')

    def is_in_hq(self):
        return bool(
            self.is_superuser
            or self.hq_function
            or hasattr(self, 'staff_record')
            or self.roles.filter(
                ends_at__isnull=True,
                role__in=[RoleCode.SUPER_ADMIN, RoleCode.EXECUTIVE_DIRECTOR, RoleCode.HQ_TEAM]
            ).exists()
        )

    def can_manage_unit(self, unit):
        if self.is_in_hq():
            return True
        if not unit:
            return False
        for r in self.get_roles():
            if r.org_unit_id and unit.id in r.org_unit.subtree_ids():
                return True
        return False


class RoleAssignment(models.Model):
    APPOINTMENT_CHOICES = [
        ('appointed', 'Appointed'),
        ('acting', 'Acting'),
        ('pending', 'Pending'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='roles')
    role = models.CharField(max_length=35, choices=RoleCode.choices)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='role_assignments')
    assigned_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_roles')
    appointment_status = models.CharField(max_length=20, choices=APPOINTMENT_CHOICES, default='appointed')
    reason = models.TextField(blank=True, default='')
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.TextField(blank=True, default='')
    founder_welcome_seen_at = models.DateTimeField(null=True, blank=True)
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

    @property
    def network_title(self):
        net = self.org_unit.network or self.profile.network or 'WGMN'
        return get_role_title(self.role, net)


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

    def __init__(self, *args, **kwargs):
        if 'entity_type' in kwargs:
            kwargs.setdefault('table_name', kwargs.pop('entity_type'))
        if 'entity_id' in kwargs:
            kwargs.setdefault('record_id', kwargs.pop('entity_id'))
        if 'summary' in kwargs:
            kwargs.setdefault('reason', kwargs.pop('summary'))
        super().__init__(*args, **kwargs)

    def __str__(self):
        return f"{self.action} on {self.table_name} [{self.record_id}] at {self.occurred_at.strftime('%Y-%m-%d %H:%M')}"

    @property
    def created_at(self):
        return self.occurred_at

    @property
    def entity_type(self):
        return self.table_name

    @property
    def entity_id(self):
        return self.record_id

    @property
    def summary(self):
        return self.reason


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
