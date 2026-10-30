from django.contrib import admin
from .models import MeetingCheckin, MeetingFile

admin.site.register(MeetingCheckin)
admin.site.register(MeetingFile)


from django import forms
from django.conf import settings
from django.contrib import messages
from django.core.exceptions import ValidationError
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from core.models import AuditLog
from operations.models import Meeting

from .models_zoom import (
    VideoPlatformSettings,
    ZoomHostAccount,
    ZoomMeeting,
    ZoomParticipantSession,
    ZoomWebhookEvent,
)
from .platform import active_hosts_count, invalidate_provider_cache, missing_zoom_settings


class VideoPlatformSettingsForm(forms.ModelForm):
    class Meta:
        model = VideoPlatformSettings
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('active_provider') == 'zoom':
            missing = missing_zoom_settings()
            if missing:
                raise ValidationError(
                    f"Cannot activate Zoom provider while environment variables are missing: {', '.join(missing)}"
                )
            if not ZoomHostAccount.objects.filter(is_active=True).exists():
                raise ValidationError(
                    'Cannot activate Zoom provider until at least one active ZoomHostAccount is configured.'
                )
        return cleaned


@admin.register(VideoPlatformSettings)
class VideoPlatformSettingsAdmin(admin.ModelAdmin):
    form = VideoPlatformSettingsForm
    list_display = (
        'active_provider',
        'fallback_to_livekit',
        'zoom_waiting_room_mode',
        'zoom_required_capacity',
        'updated_by',
        'updated_at',
    )
    readonly_fields = (
        'configuration_health',
        'upcoming_meetings_summary',
        'livekit_only_warning',
        'updated_by',
        'updated_at',
    )
    fieldsets = (
        (
            'Active Video Platform',
            {
                'fields': (
                    'active_provider',
                    'fallback_to_livekit',
                    'livekit_only_warning',
                    'configuration_health',
                    'upcoming_meetings_summary',
                ),
            },
        ),
        (
            'Zoom Provisioning Defaults',
            {
                'fields': (
                    'zoom_waiting_room_mode',
                    'zoom_join_before_host',
                    'zoom_jbh_minutes',
                    'zoom_auto_recording',
                    'zoom_required_capacity',
                    'zoom_auto_cohost_managers',
                ),
            },
        ),
        (
            'Audit',
            {
                'fields': ('updated_by', 'updated_at'),
            },
        ),
    )
    actions = ['test_zoom_connection']

    def has_add_permission(self, request):
        if VideoPlatformSettings.objects.exists():
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Allow POST admin actions on changelist if invoked directly
        if request.method == 'POST' and request.POST.get('action'):
            return super().changelist_view(request, extra_context=extra_context)
        obj = VideoPlatformSettings.load()
        return redirect(reverse('admin:meetings_videoplatformsettings_change', args=[obj.pk]))

    @admin.display(description='Configuration health')
    def configuration_health(self, obj):
        missing = missing_zoom_settings()
        redis_ok = bool(getattr(settings, 'REDIS_URL', ''))
        hosts = active_hosts_count()
        missing_str = ', '.join(missing) if missing else 'None (all ZOOM_* env vars set)'
        redis_str = 'Configured' if redis_ok else 'Missing (using LocMem / InMemory fallback)'
        return format_html(
            '<div><strong>Missing ZOOM_* env vars:</strong> {}<br>'
            '<strong>REDIS_URL:</strong> {}<br>'
            '<strong>Active Zoom host accounts:</strong> {}</div>',
            missing_str,
            redis_str,
            hosts,
        )

    @admin.display(description='Upcoming meetings per provider')
    def upcoming_meetings_summary(self, obj):
        now = timezone.now()
        qs = Meeting.objects.exclude(status__in=('cancelled', 'completed')).filter(
            models_q_upcoming(now)
        )
        woddi_count = qs.filter(platform='woddi').count()
        zoom_count = qs.filter(platform='zoom').count()
        return format_html(
            '<div><strong>LiveKit (WODDI Room):</strong> {} &nbsp;|&nbsp; <strong>Zoom:</strong> {}</div>',
            woddi_count,
            zoom_count,
        )

    @admin.display(description='Feature notice')
    def livekit_only_warning(self, obj):
        return format_html(
            '<div style="color:#9b164b;font-weight:600;">'
            'Note: WDOS AI live speech interpretation and live transcript / auto-draft minutes are LiveKit-only.'
            '</div>'
        )

    def save_model(self, request, obj, form, change):
        old_provider = None
        if obj.pk:
            prev = VideoPlatformSettings.objects.filter(pk=obj.pk).first()
            if prev:
                old_provider = prev.active_provider
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
        invalidate_provider_cache()
        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action='video_platform_settings_updated',
            table_name='meetings_videoplatformsettings',
            record_id=str(obj.pk),
            old_values={'active_provider': old_provider} if old_provider else {},
            new_values={
                'active_provider': obj.active_provider,
                'fallback_to_livekit': obj.fallback_to_livekit,
                'zoom_waiting_room_mode': obj.zoom_waiting_room_mode,
                'zoom_required_capacity': obj.zoom_required_capacity,
            },
            reason=f'Active video provider set to {obj.active_provider}',
        )

    @admin.action(description='Test Zoom connection')
    def test_zoom_connection(self, request, queryset):
        from .zoom.client import ZoomClient, ZoomError

        hosts = list(ZoomHostAccount.objects.filter(is_active=True))
        if not hosts:
            self.message_user(request, 'No active ZoomHostAccount rows to test.', level=messages.WARNING)
            return
        client = ZoomClient()
        ok_count = 0
        for host in hosts:
            try:
                info = client.get_user(host.zoom_user_id)
                ok_count += 1
                self.message_user(
                    request,
                    f"Verified Zoom host {host.email} ({info.get('id', host.zoom_user_id)})",
                    level=messages.SUCCESS,
                )
            except ZoomError as exc:
                self.message_user(
                    request,
                    f'Zoom connection failed for {host.email}: {exc}',
                    level=messages.ERROR,
                )
        if ok_count == len(hosts):
            self.message_user(request, f'All {ok_count} active Zoom hosts verified.', level=messages.SUCCESS)


def models_q_upcoming(now):
    from django.db.models import Q

    return Q(ends_at__gte=now) | Q(ends_at__isnull=True)


@admin.register(ZoomHostAccount)
class ZoomHostAccountAdmin(admin.ModelAdmin):
    list_display = ('label', 'email', 'zoom_user_id', 'capacity', 'is_active', 'updated_at')
    list_filter = ('is_active', 'capacity')
    search_fields = ('label', 'email', 'zoom_user_id')
    actions = ['verify_host']

    @admin.action(description='Verify host on Zoom API')
    def verify_host(self, request, queryset):
        from .zoom.client import ZoomClient, ZoomError

        client = ZoomClient()
        for host in queryset:
            try:
                data = client.get_user(host.zoom_user_id)
                lic_type = data.get('type')
                self.message_user(
                    request,
                    f"Host {host.email} verified on Zoom (id={data.get('id')}, type={lic_type}).",
                    level=messages.SUCCESS,
                )
            except ZoomError as exc:
                self.message_user(
                    request,
                    f'Failed to verify {host.email}: {exc}',
                    level=messages.ERROR,
                )


@admin.register(ZoomMeeting)
class ZoomMeetingAdmin(admin.ModelAdmin):
    list_display = (
        'zoom_meeting_id',
        'meeting',
        'host_account',
        'meeting_type',
        'sync_state',
        'is_live',
        'occupies_from',
        'occupies_until',
        'updated_at',
    )
    list_filter = ('sync_state', 'is_live', 'meeting_type')
    search_fields = ('zoom_meeting_id', 'meeting__title', 'host_account__email')
    readonly_fields = (
        'meeting',
        'host_account',
        'zoom_meeting_id',
        'zoom_uuid',
        'meeting_type',
        'occupies_from',
        'occupies_until',
        'sync_state',
        'last_error',
        'is_live',
        'started_at',
        'ended_at',
        'created_at',
        'updated_at',
    )
    exclude = ('passcode_enc',)
    actions = ['retry_failed_sync']

    def has_add_permission(self, request):
        return False

    @admin.action(description='Retry failed Zoom sync')
    def retry_failed_sync(self, request, queryset):
        from .zoom.provisioning import reconcile_pending_zoom_meeting

        for zm in queryset:
            ok, err = reconcile_pending_zoom_meeting(zm)
            if ok:
                self.message_user(request, f'Zoom #{zm.zoom_meeting_id} synced.', level=messages.SUCCESS)
            else:
                self.message_user(request, f'Zoom #{zm.zoom_meeting_id} sync error: {err}', level=messages.ERROR)


@admin.register(ZoomParticipantSession)
class ZoomParticipantSessionAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'customer_key',
        'zoom_meeting',
        'profile',
        'guest',
        'joined_at',
        'left_at',
        'leave_reason',
    )
    list_filter = ('joined_at', 'left_at')
    search_fields = ('name', 'customer_key', 'participant_user_id', 'participant_uuid')
    readonly_fields = [f.name for f in ZoomParticipantSession._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(ZoomWebhookEvent)
class ZoomWebhookEventAdmin(admin.ModelAdmin):
    list_display = ('event', 'event_ts', 'dedupe_key', 'received_at', 'processed_at', 'error')
    list_filter = ('event',)
    search_fields = ('event', 'dedupe_key', 'error')
    readonly_fields = [f.name for f in ZoomWebhookEvent._meta.fields]

    def has_add_permission(self, request):
        return False
