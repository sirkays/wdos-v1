from django.contrib import admin
from .models import (
    Task, TaskComment, TaskChecklistItem, TaskFile, TaskTemplate,
    Meeting, MeetingAttendance, Announcement, AnnouncementRead,
    Programme, ProgrammeEvent, Beneficiary, ServiceRecord,
    CaseFile, CaseUpdate, HelpdeskTicket, TicketMessage,
    StaffMessage, StaffReport, DocumentFolder, Document,
    ActivationJourney, ActivationDay, ActivationItem, ActivationResponse,
    ReportTemplate, ActivityRecord, Issue, UatFeedback
)


class TaskCommentInline(admin.TabularInline):
    model = TaskComment
    extra = 0
    readonly_fields = ('author', 'created_at')


class TaskChecklistInline(admin.TabularInline):
    model = TaskChecklistItem
    extra = 0


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'org_unit', 'assigned_to', 'priority', 'status', 'due_on', 'created_at')
    list_filter = ('priority', 'status', 'org_unit__level')
    search_fields = ('title', 'details', 'assigned_to__email', 'assigned_to__first_name', 'assigned_to__last_name')
    raw_id_fields = ('org_unit', 'assigned_to', 'assigned_by')
    inlines = [TaskChecklistInline, TaskCommentInline]
    date_hierarchy = 'created_at'


class AttendanceInline(admin.TabularInline):
    model = MeetingAttendance
    extra = 0
    raw_id_fields = ('profile',)


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ('title', 'org_unit', 'organiser', 'mode', 'platform', 'starts_at', 'status')
    list_filter = ('mode', 'platform', 'status', 'org_unit__level')
    search_fields = ('title', 'agenda', 'location')
    raw_id_fields = ('org_unit', 'organiser')
    inlines = [AttendanceInline]
    date_hierarchy = 'starts_at'
    actions = ['move_to_zoom', 'move_to_livekit']

    def _can_move_platform(self, request, m) -> bool:
        from django.contrib import messages
        from meetings.views import _room_open
        from meetings.zoom_views import zoom_open

        if m.status != 'scheduled':
            self.message_user(
                request,
                f'Cannot move "{m.title}": only scheduled meetings can change provider.',
                level=messages.ERROR,
            )
            return False
        if m.starts_at and (_room_open(m) or zoom_open(m)):
            self.message_user(
                request,
                f'Cannot move "{m.title}": the meeting room window has already opened.',
                level=messages.ERROR,
            )
            return False
        if m.checkins.exists():
            self.message_user(
                request,
                f'Cannot move "{m.title}": participants have already checked in.',
                level=messages.ERROR,
            )
            return False
        return True

    @admin.action(description='Move to Zoom')
    def move_to_zoom(self, request, queryset):
        from django.contrib import messages
        from django.db import transaction
        from meetings.zoom.client import ZoomError
        from meetings.zoom.provisioning import create_zoom_meeting

        for m in queryset:
            if m.platform == 'zoom' and hasattr(m, 'zoom'):
                continue
            if not self._can_move_platform(request, m):
                continue
            try:
                with transaction.atomic():
                    m.platform = 'zoom'
                    if not m.location or m.location == 'WODDI Room':
                        m.location = 'Zoom meeting'
                    m.save(update_fields=['platform', 'location', 'updated_at'])
                    create_zoom_meeting(m)
                self.message_user(request, f'Moved "{m.title}" to Zoom.', level=messages.SUCCESS)
            except ZoomError as exc:
                self.message_user(
                    request,
                    f'Failed to move "{m.title}" to Zoom: {exc}',
                    level=messages.ERROR,
                )

    @admin.action(description='Move to LiveKit')
    def move_to_livekit(self, request, queryset):
        from django.contrib import messages
        from meetings.zoom.provisioning import delete_zoom_meeting

        for m in queryset:
            if m.platform == 'woddi':
                continue
            if not self._can_move_platform(request, m):
                continue
            if hasattr(m, 'zoom'):
                delete_zoom_meeting(m)
                m.zoom.delete()
            m.platform = 'woddi'
            if not m.location or m.location == 'Zoom meeting':
                m.location = 'WODDI Room'
            m.save(update_fields=['platform', 'location', 'updated_at'])
            self.message_user(request, f'Moved "{m.title}" to LiveKit (WODDI Room).', level=messages.SUCCESS)


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'org_unit', 'network', 'priority', 'author', 'created_at')
    list_filter = ('priority', 'network', 'org_unit__level')
    search_fields = ('title', 'body')
    raw_id_fields = ('org_unit', 'author')
    date_hierarchy = 'created_at'


@admin.register(Programme)
class ProgrammeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'network', 'is_active')
    list_filter = ('network', 'is_active')
    search_fields = ('code', 'name')


@admin.register(ProgrammeEvent)
class ProgrammeEventAdmin(admin.ModelAdmin):
    list_display = ('title', 'programme', 'org_unit', 'event_date', 'location')
    list_filter = ('programme', 'org_unit__level')
    search_fields = ('title', 'location')
    raw_id_fields = ('programme', 'org_unit', 'created_by')


@admin.register(Beneficiary)
class BeneficiaryAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'age_band', 'org_unit', 'created_at')
    search_fields = ('full_name',)
    raw_id_fields = ('org_unit', 'created_by')


@admin.register(ServiceRecord)
class ServiceRecordAdmin(admin.ModelAdmin):
    list_display = ('service', 'beneficiary', 'event', 'recorded_at')
    search_fields = ('service', 'beneficiary__full_name')
    raw_id_fields = ('event', 'beneficiary', 'recorded_by')


@admin.register(CaseFile)
class CaseFileAdmin(admin.ModelAdmin):
    list_display = ('case_no', 'category', 'subject', 'status', 'created_at')
    list_filter = ('category', 'status')
    search_fields = ('case_no', 'subject', 'details')
    raw_id_fields = ('org_unit', 'reporter')


@admin.register(HelpdeskTicket)
class HelpdeskTicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_no', 'category', 'subject', 'priority', 'status', 'requester', 'created_at')
    list_filter = ('category', 'priority', 'status')
    search_fields = ('ticket_no', 'subject', 'details')
    raw_id_fields = ('requester', 'assigned_to')


@admin.register(StaffMessage)
class StaffMessageAdmin(admin.ModelAdmin):
    list_display = ('sender', 'recipient', 'read_at', 'created_at')
    search_fields = ('sender__email', 'recipient__email', 'body')
    raw_id_fields = ('sender', 'recipient')


@admin.register(StaffReport)
class StaffReportAdmin(admin.ModelAdmin):
    list_display = ('author', 'report_date', 'status', 'reviewer', 'reviewed_at')
    list_filter = ('status',)
    search_fields = ('author__email', 'tasks_completed')
    raw_id_fields = ('author', 'reviewer')


@admin.register(ActivationDay)
class ActivationDayAdmin(admin.ModelAdmin):
    list_display = ('seq', 'title', 'has_assessment')


@admin.register(ActivationItem)
class ActivationItemAdmin(admin.ModelAdmin):
    list_display = ('day', 'seq', 'prompt', 'item_type')
    list_filter = ('day',)


@admin.register(ActivationJourney)
class ActivationJourneyAdmin(admin.ModelAdmin):
    list_display = ('profile', 'status', 'started_at', 'due_at', 'completed_at')
    list_filter = ('status',)
    search_fields = ('profile__email', 'profile__first_name', 'profile__last_name')
    raw_id_fields = ('profile',)


@admin.register(ActivityRecord)
class ActivityRecordAdmin(admin.ModelAdmin):
    list_display = ('activity_type', 'org_unit', 'author', 'activity_date', 'attendees_count')
    list_filter = ('activity_type', 'org_unit__level')
    search_fields = ('description', 'author__email')
    raw_id_fields = ('org_unit', 'author')


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ('title', 'org_unit', 'priority', 'status', 'reported_by', 'created_at')
    list_filter = ('priority', 'status')
    search_fields = ('title', 'description')
    raw_id_fields = ('org_unit', 'reported_by')


@admin.register(UatFeedback)
class UatFeedbackAdmin(admin.ModelAdmin):
    list_display = ('page', 'category', 'status', 'user', 'created_at')
    list_filter = ('category', 'status')
    search_fields = ('page', 'comment')
    raw_id_fields = ('user',)


@admin.register(TaskTemplate)
class TaskTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'title', 'priority', 'requires_approval', 'is_shared', 'created_by', 'created_at')
    list_filter = ('priority', 'requires_approval', 'is_shared')
    search_fields = ('name', 'title', 'details')
    raw_id_fields = ('created_by',)


@admin.register(DocumentFolder)
class DocumentFolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'created_at')
    search_fields = ('name',)
    raw_id_fields = ('parent',)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'folder', 'is_archived', 'uploaded_by', 'created_at')
    list_filter = ('is_archived', 'folder')
    search_fields = ('title', 'file_path')
    raw_id_fields = ('folder', 'uploaded_by')


@admin.register(ActivationResponse)
class ActivationResponseAdmin(admin.ModelAdmin):
    list_display = ('journey', 'item', 'is_correct', 'answered_at')
    list_filter = ('is_correct',)
    raw_id_fields = ('journey', 'item')


@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    list_display = ('title', 'category')
    list_filter = ('category',)
    search_fields = ('title', 'description')

