from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from ...models_zoom import ZoomMeeting, ZoomWebhookEvent
from ...zoom.client import ZoomClient, ZoomError, ZoomNotFound
from ...zoom.provisioning import reconcile_pending_zoom_meeting


class Command(BaseCommand):
    help = 'Safety-net reconciliation for Zoom meetings and webhook event cleanup.'

    def handle(self, *args, **options):
        client = ZoomClient()
        now = timezone.now()

        # 1. Retry pending_update and pending_delete rows
        pending_qs = ZoomMeeting.objects.select_related('meeting', 'host_account').filter(
            sync_state__in=('pending_update', 'pending_delete')
        )
        retried = 0
        for zm in pending_qs:
            ok, _ = reconcile_pending_zoom_meeting(zm, client=client)
            if ok:
                retried += 1

        # 2. Reconcile is_live with GET /meetings/{id} for meetings in their window
        # that haven't been updated in >30 minutes
        stale_cutoff = now - timedelta(minutes=30)
        window_qs = ZoomMeeting.objects.select_related('meeting').filter(
            sync_state='ok',
            updated_at__lt=stale_cutoff,
            meeting__status__in=('scheduled', 'in_progress'),
        ).filter(
            Q(occupies_from__isnull=True)
            | (Q(occupies_from__lte=now) & Q(occupies_until__gte=now))
        )
        checked = 0
        for zm in window_qs:
            checked += 1
            try:
                info = client.get_meeting(zm.zoom_meeting_id)
                remote_status = info.get('status', '')
                should_be_live = remote_status == 'started'
                if zm.is_live != should_be_live:
                    zm.is_live = should_be_live
                    if not should_be_live:
                        zm.ended_at = now
                    zm.save(update_fields=['is_live', 'ended_at', 'updated_at'])
            except ZoomNotFound:
                zm.sync_state = 'error'
                zm.is_live = False
                zm.last_error = 'Meeting not found on Zoom during reconciliation.'
                zm.save(update_fields=['sync_state', 'is_live', 'last_error', 'updated_at'])
            except ZoomError:
                pass

        # 3. Purge ZoomWebhookEvent rows older than 30 days
        old_cutoff = now - timedelta(days=30)
        deleted_events, _ = ZoomWebhookEvent.objects.filter(received_at__lt=old_cutoff).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f'zoom_reconcile complete: retried={retried}, live_checked={checked}, purged_webhooks={deleted_events}'
            )
        )
