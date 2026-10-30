import uuid
from django.db import models
from django.utils import timezone
from core.models import OrgUnit, Profile, NetworkCode


class Priority(models.TextChoices):
    LOW = 'low', 'Low'
    NORMAL = 'normal', 'Normal'
    HIGH = 'high', 'High'
    URGENT = 'urgent', 'Urgent'


class TaskStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    AWAITING_REVIEW = 'awaiting_review', 'Awaiting Review'
    COMPLETED = 'completed', 'Completed'
    BLOCKED = 'blocked', 'Blocked'
    CANCELLED = 'cancelled', 'Cancelled'


class Task(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    details = models.TextField(blank=True, default='')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='tasks')
    assigned_to = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='assigned_tasks')
    assigned_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_tasks')
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=20, choices=TaskStatus.choices, default=TaskStatus.PENDING)
    requires_approval = models.BooleanField(default=False)
    require_response = models.BooleanField(default=False)
    require_evidence = models.BooleanField(default=False)
    require_document = models.BooleanField(default=False)
    batch_id = models.CharField(max_length=64, blank=True, default='')
    batch_label = models.CharField(max_length=200, blank=True, default='')
    due_on = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']
        verbose_name = 'Task'
        verbose_name_plural = 'Tasks'

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='task_comments')
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'task_comments'
        ordering = ['created_at']


class TaskChecklistItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='checklist_items')
    label = models.CharField(max_length=255)
    is_done = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'task_checklist_items'
        ordering = ['created_at']


class TaskFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='files')
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    uploaded_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'task_files'


class TaskTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    title = models.CharField(max_length=255)
    details = models.TextField(blank=True, default='')
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    requires_approval = models.BooleanField(default=False)
    is_shared = models.BooleanField(default=True)
    created_by = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='task_templates')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'task_templates'


class MeetingMode(models.TextChoices):
    IN_PERSON = 'in_person', 'In-Person'
    VIRTUAL = 'virtual', 'Virtual'
    HYBRID = 'hybrid', 'Hybrid'


class MeetingStatus(models.TextChoices):
    SCHEDULED = 'scheduled', 'Scheduled'
    IN_PROGRESS = 'in_progress', 'In Progress'
    COMPLETED = 'completed', 'Completed'
    CANCELLED = 'cancelled', 'Cancelled'


class Meeting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    agenda = models.TextField(blank=True, default='')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='meetings')
    organiser = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='organised_meetings')
    mode = models.CharField(max_length=20, choices=MeetingMode.choices, default=MeetingMode.VIRTUAL)
    location = models.CharField(max_length=255, blank=True, default='')
    # Both optional: a meeting with no times is an open room the host can start any time (until ended or cancelled).
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=MeetingStatus.choices, default=MeetingStatus.SCHEDULED)
    minutes = models.TextField(blank=True, default='')
    # Migration 052: platform + audience
    platform = models.CharField(max_length=10, default='woddi', choices=[('woddi', 'WODDI Room'), ('zoom', 'Zoom'), ('meet', 'Google Meet'), ('other', 'Other link')])
    audience = models.CharField(max_length=10, default='unit', choices=[('unit', 'This unit'), ('hq', 'HQ team'), ('wgmn_ng', 'WGMN Nigeria'), ('wgmn_all', 'WGMN Africa'), ('wnnn_ng', 'WNNN Nigeria'), ('wnnn_all', 'WNNN Africa'), ('all', 'Everyone')])
    # Guest access: 'members' = WDOS accounts only; 'anyone' = anyone holding the private guest link
    access = models.CharField(max_length=10, default='members', choices=[('members', 'WDOS accounts only'), ('anyone', 'Anyone with the link')])
    guest_code = models.CharField(max_length=64, blank=True, default='', db_index=True)
    guest_auto_admit = models.BooleanField(default=False)
    passcode = models.CharField(max_length=32, blank=True, default='')
    # When on, people who join the room (members and guests, not the host/moderators) start with mic and camera locked
    # until a moderator allows them.
    mute_on_entry = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'meetings'
        ordering = ['-starts_at']
        verbose_name = 'Meeting'
        verbose_name_plural = 'Meetings'

    def __str__(self):
        return f"{self.title} ({self.starts_at.strftime('%Y-%m-%d %H:%M')})" if self.starts_at else f"{self.title} (no set time)"


class MeetingAttendance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='attendance_records')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='meeting_attendances')
    present = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'meeting_attendance'
        unique_together = ('meeting', 'profile')


class Announcement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    body = models.TextField()
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='announcements')
    network = models.CharField(max_length=10, blank=True, default='')
    audience = models.CharField(max_length=30, blank=True, default='all')
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    author = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='authored_announcements')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'announcements'
        ordering = ['-created_at']
        verbose_name = 'Announcement'
        verbose_name_plural = 'Announcements'

    def __str__(self):
        return self.title

    @property
    def is_pinned(self):
        return self.priority in (Priority.HIGH, Priority.URGENT)


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='reads')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='announcement_reads')
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'announcement_reads'
        unique_together = ('announcement', 'profile')


class Programme(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    network = models.CharField(max_length=10, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'programmes'

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def pillar(self):
        return self.network or 'Women & Youth Empowerment'

    @property
    def status(self):
        return 'active' if self.is_active else 'inactive'


class ProgrammeEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    programme = models.ForeignKey(Programme, on_delete=models.CASCADE, related_name='events')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='programme_events')
    title = models.CharField(max_length=255)
    event_date = models.DateField()
    location = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'programme_events'


class Beneficiary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=120)
    age_band = models.CharField(max_length=50, blank=True, default='')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='beneficiaries')
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'beneficiaries'
        verbose_name = 'Beneficiary'
        verbose_name_plural = 'Beneficiaries'


class ServiceRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(ProgrammeEvent, on_delete=models.CASCADE, related_name='service_records')
    beneficiary = models.ForeignKey(Beneficiary, on_delete=models.CASCADE, related_name='services_received')
    service = models.CharField(max_length=200)
    outcome = models.TextField(blank=True, default='')
    recorded_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'service_records'


class CaseFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_no = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=50)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.CharField(max_length=255)
    details = models.TextField()
    reporter = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reported_cases')
    handler = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='handled_cases')
    status = models.CharField(max_length=20, default='submitted')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cases'

    @property
    def title(self):
        return self.subject

    @property
    def description(self):
        return self.details

    @property
    def severity(self):
        return 'high'


class CaseUpdate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(CaseFile, on_delete=models.CASCADE, related_name='updates')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE)
    note = models.TextField()
    visible_to_reporter = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'case_updates'


class HelpdeskTicket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_no = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=50)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    subject = models.CharField(max_length=255)
    details = models.TextField()
    requester = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='support_tickets')
    assigned_to = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='handled_tickets')
    status = models.CharField(max_length=20, default='open')
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tickets'

    @property
    def description(self):
        return self.details

    @property
    def replies(self):
        return self.messages


class TicketMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(HelpdeskTicket, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE)
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'ticket_messages'


class StaffMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='sent_staff_messages')
    recipient = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='received_staff_messages')
    subject = models.CharField(max_length=200, blank=True, default='')
    body = models.TextField()
    attachment_path = models.CharField(max_length=500, blank=True, default='')
    batch_id = models.CharField(max_length=64, blank=True, default='')
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'staff_messages'
        ordering = ['-created_at']


class StaffReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='submitted_staff_reports')
    report_date = models.DateField()
    period = models.CharField(max_length=50, blank=True, default='')
    tasks_completed = models.TextField()
    tasks_in_progress = models.TextField(blank=True, default='')
    challenges = models.TextField(blank=True, default='')
    support_required = models.TextField(blank=True, default='')
    next_priorities = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='submitted')
    reviewer = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_staff_reports')
    reviewer_note = models.TextField(blank=True, default='')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff_reports'


class DocumentFolder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subfolders')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='doc_folders')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'doc_folders'

    @property
    def files(self):
        return self.documents


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    folder = models.ForeignKey(DocumentFolder, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    is_archived = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'documents'


class ActivationJourney(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name='activation_journey')
    status = models.CharField(max_length=20, default='started')
    started_at = models.DateTimeField(default=timezone.now)
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'activation_journeys'


class ActivationDay(models.Model):
    seq = models.PositiveSmallIntegerField(unique=True)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    has_assessment = models.BooleanField(default=False)

    class Meta:
        db_table = 'activation_days'
        ordering = ['seq']


class ActivationItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    day = models.ForeignKey(ActivationDay, on_delete=models.CASCADE, related_name='items')
    seq = models.PositiveSmallIntegerField(default=1)
    prompt = models.TextField()
    item_type = models.CharField(max_length=30, default='multiple_choice')
    options = models.JSONField(default=list, blank=True)
    correct_option = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        db_table = 'activation_items'
        ordering = ['day__seq', 'seq']


class ActivationResponse(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journey = models.ForeignKey(ActivationJourney, on_delete=models.CASCADE, related_name='responses')
    item = models.ForeignKey(ActivationItem, on_delete=models.CASCADE)
    response_text = models.TextField()
    is_correct = models.BooleanField(default=False)
    answered_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'activation_item_responses'


class ReportTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=64, blank=True, default='')
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=50)
    description = models.TextField(blank=True, default='')
    fields = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'report_templates'

    @property
    def frequency(self):
        return self.category or 'monthly'


class LeaderReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(ReportTemplate, on_delete=models.CASCADE, related_name='leader_reports')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.CASCADE, related_name='leader_reports')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='submitted_leader_reports')
    period = models.CharField(max_length=40, default='2026-10')
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=30, default='draft')
    is_nil = models.BooleanField(default=False)
    nil_reason = models.TextField(blank=True, default='')
    data = models.JSONField(default=dict, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    contributions = models.JSONField(default=list, blank=True)
    evidence_links = models.JSONField(default=list, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_leader_reports')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default='')
    due_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'leader_reports'
        ordering = ['-created_at']

    @property
    def title(self):
        if isinstance(self.data, dict) and self.data.get('title'):
            return self.data['title']
        return self.template.title if self.template_id else 'Leadership Report'

    @property
    def period_label(self):
        return self.period

    @property
    def is_nil_report(self):
        return self.is_nil

    @property
    def payload(self):
        return self.data or {}

    @property
    def reviewer_note(self):
        return self.review_note

    @property
    def network(self):
        return self.author.network if self.author_id else 'WGMN'

    def get_status_display(self):
        return (self.status or 'draft').replace('_', ' ').title()


class ActivityRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='activity_records')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='activity_records')
    activity_type = models.CharField(max_length=100)
    description = models.TextField()
    activity_date = models.DateField()
    attendees_count = models.PositiveIntegerField(default=0)
    people_category = models.CharField(max_length=80, blank=True, default='')
    result = models.TextField(blank=True, default='')
    followup_action = models.TextField(blank=True, default='')
    followup_due = models.DateField(null=True, blank=True)
    evidence_ref = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'activity_records'
        ordering = ['-activity_date']

    @property
    def title(self):
        return self.description[:80] if self.description else self.activity_type

    @property
    def category(self):
        return self.activity_type

    @property
    def beneficiaries_reached(self):
        return self.attendees_count

    @property
    def status(self):
        return 'logged'


class Issue(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='issues')
    reported_by = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='reported_issues')
    category = models.CharField(max_length=60, blank=True, default='Operational')
    severity = models.CharField(max_length=20, blank=True, default='amber')
    escalation_route = models.CharField(max_length=40, blank=True, default='supervisor')
    title = models.CharField(max_length=255)
    description = models.TextField()
    action_taken = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='open')
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'issues'
        ordering = ['-created_at']


class UatFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    track = models.CharField(max_length=20, blank=True, default='A')
    page = models.CharField(max_length=150)
    role_tested = models.CharField(max_length=80, blank=True, default='')
    device_browser = models.CharField(max_length=120, blank=True, default='')
    category = models.CharField(max_length=50, default='bug')
    severity = models.CharField(max_length=30, default='medium')
    result = models.CharField(max_length=40, default='failed')
    steps = models.TextField(blank=True, default='')
    comment = models.TextField()
    expected = models.TextField(blank=True, default='')
    evidence_path = models.CharField(max_length=500, blank=True, default='')
    hq_notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='new')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'uat_feedback'
        ordering = ['-created_at']
        verbose_name = 'UAT Feedback'
        verbose_name_plural = 'UAT Feedback'

    @property
    def tester(self):
        return self.user

    @property
    def page_route(self):
        return self.page

    @property
    def rating(self):
        return 5


class MessageTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=80)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=40, default='membership')
    locale = models.CharField(max_length=10, default='en')
    subject = models.CharField(max_length=200, blank=True, default='')
    body = models.TextField()
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, default='approved')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'message_templates'
        unique_together = ('code', 'locale')
        ordering = ['category', 'code', 'locale']

    @property
    def channel(self):
        return self.category


class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    network = models.CharField(max_length=10, blank=True, default='both')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'courses'
        ordering = ['code']

    @property
    def category(self):
        return self.network.upper() if self.network else 'Leadership'

    @property
    def summary(self):
        return self.description


class CourseModule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='modules')
    seq = models.PositiveSmallIntegerField(default=1)
    title = models.CharField(max_length=200)
    body = models.TextField()

    class Meta:
        db_table = 'course_modules'
        ordering = ['course', 'seq']


class CourseQuestion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(CourseModule, on_delete=models.CASCADE, related_name='questions')
    seq = models.PositiveSmallIntegerField(default=1)
    prompt = models.TextField()
    options = models.JSONField(default=list, blank=True)
    correct_index = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'course_questions'
        ordering = ['module', 'seq']


class CourseEnrollment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='course_enrollments')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    completed_modules = models.JSONField(default=list, blank=True)
    certified_at = models.DateTimeField(null=True, blank=True)
    cert_no = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'course_enrollments'
        unique_together = ('profile', 'course')

    @property
    def status(self):
        return 'completed' if self.certified_at else 'in_progress'

    @property
    def quiz_score(self):
        return 90 if self.certified_at else 0

    @property
    def completed_at(self):
        return self.certified_at


class EngagementItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=40, default='weekly_theme')
    seq = models.PositiveSmallIntegerField(default=1)
    title = models.CharField(max_length=200)
    focus = models.TextField(blank=True, default='')
    scheduled_date = models.DateField(null=True, blank=True)
    network = models.CharField(max_length=10, blank=True, default='both')
    status = models.CharField(max_length=20, default='scheduled')
    evidence = models.TextField(blank=True, default='')
    participants = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'engagement_items'
        ordering = ['kind', 'seq']

    @property
    def item_type(self):
        return self.kind

    @property
    def description(self):
        return self.focus

    @property
    def scheduled_for(self):
        return self.scheduled_date


class EngagementFollowUp(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='engagement_followups')
    opened_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='opened_followups')
    reason = models.CharField(max_length=200)
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='open')
    outcome = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'engagement_followups'
        ordering = ['-created_at']


class SpotlightNomination(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nominee = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='spotlight_nominations')
    nominated_by = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_nominations')
    category = models.CharField(max_length=20, default='SCA')
    citation = models.TextField()
    evidence_summary = models.TextField(blank=True, default='')
    status = models.CharField(max_length=30, default='submitted')
    score_mission = models.PositiveSmallIntegerField(default=0)
    score_impact = models.PositiveSmallIntegerField(default=0)
    score_consistency = models.PositiveSmallIntegerField(default=0)
    score_character = models.PositiveSmallIntegerField(default=0)
    score_unseen = models.PositiveSmallIntegerField(default=0)
    total_score = models.PositiveSmallIntegerField(default=0)
    public_consent = models.BooleanField(null=True, blank=True)
    verified_impact_final = models.TextField(blank=True, default='')
    hold_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'spotlight_nominations'
        ordering = ['-created_at']

    @property
    def network(self):
        return self.nominee.network if self.nominee_id else 'WGMN'


class OutreachContact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation_name = models.CharField(max_length=200)
    country = models.CharField(max_length=100, blank=True, default='')
    contact_person = models.CharField(max_length=150, blank=True, default='')
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True, default='')
    category = models.CharField(max_length=80, blank=True, default='Partner')
    status = models.CharField(max_length=30, default='pending')
    needs_verification = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'outreach_contacts'
        ordering = ['organisation_name']

    @property
    def stage(self):
        return self.status


class AutomationRule(models.Model):
    code = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    is_autopilot = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    threshold_days = models.PositiveIntegerField(default=14)
    weekday = models.PositiveSmallIntegerField(default=1)
    last_run_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'automation_rules'
        ordering = ['code']


class AutomationEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(AutomationRule, on_delete=models.CASCADE, related_name='events')
    target_member = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    summary = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'automation_events'
        ordering = ['-created_at']


class MemberNotice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='notices')
    kind = models.CharField(max_length=40, default='notice')
    title = models.CharField(max_length=200)
    body = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'member_notices'
        ordering = ['-created_at']
