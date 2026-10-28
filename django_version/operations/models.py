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
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
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
        return f"{self.title} ({self.starts_at.strftime('%Y-%m-%d %H:%M')})"


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
    status = models.CharField(max_length=20, default='open')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cases'


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
    body = models.TextField()
    attachment_path = models.CharField(max_length=500, blank=True, default='')
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
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'doc_folders'


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
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=50)
    description = models.TextField(blank=True, default='')
    fields = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'report_templates'


class ActivityRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='activity_records')
    author = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='activity_records')
    activity_type = models.CharField(max_length=100)
    description = models.TextField()
    activity_date = models.DateField()
    attendees_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'activity_records'
        ordering = ['-activity_date']


class Issue(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.RESTRICT, related_name='issues')
    reported_by = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='reported_issues')
    title = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(max_length=20, default='open')
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'issues'


class UatFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.SET_NULL, null=True, blank=True)
    page = models.CharField(max_length=150)
    category = models.CharField(max_length=50)
    comment = models.TextField()
    evidence_path = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=20, default='submitted')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'uat_feedback'
        ordering = ['-created_at']
        verbose_name = 'UAT Feedback'
        verbose_name_plural = 'UAT Feedback'

