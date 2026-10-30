from datetime import timedelta
from django.db import transaction
from django.db.models import Q

from ..models_zoom import VideoPlatformSettings, ZoomHostAccount, ZoomMeeting
from .client import ZoomAllocationError


def compute_occupancy_window(starts_at, ends_at):
    """Return (occupies_from, occupies_until) for a meeting.
    Scheduled meetings occupy from starts_at - 15 min to (ends_at or starts_at + 60 min) + 30 min.
    No-time meetings return (None, None) and occupy the host until completed or cancelled.
    """
    if not starts_at:
        return None, None
    effective_end = ends_at if (ends_at and ends_at > starts_at) else (starts_at + timedelta(minutes=60))
    return starts_at - timedelta(minutes=15), effective_end + timedelta(minutes=30)


def allocate_host(window=None, capacity: int | None = None, *, starts_at=None, ends_at=None, exclude_meeting_id=None) -> ZoomHostAccount:
    """Select the smallest-capacity active ZoomHostAccount >= required capacity without an overlapping meeting.
    Runs inside transaction.atomic() with select_for_update() on active hosts.
    """
    if window is not None and isinstance(window, (tuple, list)) and len(window) == 2:
        occ_from, occ_until = window
    else:
        occ_from, occ_until = compute_occupancy_window(starts_at, ends_at)

    if capacity is None:
        capacity = VideoPlatformSettings.load().zoom_required_capacity

    with transaction.atomic():
        candidates = list(
            ZoomHostAccount.objects.select_for_update()
            .filter(is_active=True, capacity__gte=capacity)
            .order_by('capacity', 'pk')
        )
        if not candidates:
            raise ZoomAllocationError(
                f'No active Zoom host account found with capacity >= {capacity}.'
            )

        for host in candidates:
            active_meetings = ZoomMeeting.objects.filter(
                host_account=host,
            ).exclude(
                meeting__status__in=('completed', 'cancelled'),
            ).exclude(
                sync_state='pending_delete',
            )
            if exclude_meeting_id is not None:
                active_meetings = active_meetings.exclude(meeting_id=exclude_meeting_id)

            if occ_from is None or occ_until is None:
                # A no-time meeting occupies the host indefinitely while active, so host must have zero active meetings
                if not active_meetings.exists():
                    return host
            else:
                # Overlaps with any active no-time meeting OR any scheduled meeting where from < occ_until and until > occ_from
                conflict_q = Q(occupies_from__isnull=True) | Q(occupies_until__isnull=True) | (
                    Q(occupies_from__lt=occ_until) & Q(occupies_until__gt=occ_from)
                )
                if not active_meetings.filter(conflict_q).exists():
                    return host

        raise ZoomAllocationError(
            'All eligible Zoom host accounts are already booked during this time window.'
        )
