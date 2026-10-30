import datetime
import logging
import secrets
import string
from django.utils import timezone

from ..models_zoom import VideoPlatformSettings, ZoomMeeting
from .allocator import allocate_host, compute_occupancy_window
from .client import ZoomClient, ZoomError, ZoomNotFound

logger = logging.getLogger(__name__)

PASSCODE_ALPHABET = string.ascii_letters + string.digits


def generate_zoom_passcode(length: int = 10) -> str:
    """Generate a random 10-character alphanumeric Zoom passcode."""
    return ''.join(secrets.choice(PASSCODE_ALPHABET) for _ in range(length))


def _build_zoom_payload(meeting, cfg: VideoPlatformSettings, passcode: str) -> dict:
    has_start = bool(meeting.starts_at)
    meeting_type = 2 if has_start else 3
    duration_mins = 60
    if meeting.starts_at and meeting.ends_at and meeting.ends_at > meeting.starts_at:
        duration_mins = max(15, int((meeting.ends_at - meeting.starts_at).total_seconds() // 60))

    waiting_room_enabled = cfg.zoom_waiting_room_mode == 'everyone'
    settings_dict = {
        'join_before_host': bool(cfg.zoom_join_before_host),
        'jbh_time': int(cfg.zoom_jbh_minutes),
        'waiting_room': waiting_room_enabled,
        'mute_upon_entry': bool(meeting.mute_on_entry),
        'auto_recording': cfg.zoom_auto_recording or 'none',
        'approval_type': 2,
        'meeting_authentication': False,
        'host_video': True,
        'participant_video': False,
    }
    if waiting_room_enabled:
        settings_dict['waiting_room_options'] = {
            'mode': 'custom',
            'who_goes_to_waiting_room': 'everyone',
        }

    payload = {
        'topic': (meeting.title or 'WDOS Meeting')[:200],
        'type': meeting_type,
        'password': passcode,
        'agenda': (meeting.agenda or '')[:2000],
        'settings': settings_dict,
    }
    if has_start:
        utc_start = meeting.starts_at.astimezone(datetime.timezone.utc)
        payload['start_time'] = utc_start.strftime('%Y-%m-%dT%H:%M:%SZ')
        payload['duration'] = duration_mins
        payload['timezone'] = 'UTC'
    return payload


def create_zoom_meeting(meeting, *, client: ZoomClient | None = None) -> ZoomMeeting:
    """Allocate a licensed Zoom host and provision a real Zoom meeting via S2S REST API."""
    cfg = VideoPlatformSettings.load()
    occ_from, occ_until = compute_occupancy_window(meeting.starts_at, meeting.ends_at)
    host = allocate_host(
        (occ_from, occ_until),
        capacity=cfg.zoom_required_capacity,
        exclude_meeting_id=meeting.pk,
    )
    passcode = generate_zoom_passcode(10)
    payload = _build_zoom_payload(meeting, cfg, passcode)

    c = client or ZoomClient()
    data = c.create_meeting(host.zoom_user_id, payload)
    zoom_id = data.get('id')
    if not zoom_id:
        raise ZoomError('Zoom create_meeting response did not contain a meeting id.')

    zm = ZoomMeeting(
        meeting=meeting,
        host_account=host,
        zoom_meeting_id=int(zoom_id),
        zoom_uuid=str(data.get('uuid') or ''),
        meeting_type=payload['type'],
        occupies_from=occ_from,
        occupies_until=occ_until,
        sync_state='ok',
        last_error='',
    )
    zm.set_passcode(str(data.get('password') or passcode))
    zm.save()
    return zm


def update_zoom_meeting(meeting, *, client: ZoomClient | None = None, **fields) -> bool:
    """Send a PATCH to Zoom for updated meeting settings/schedule. Never raises into a committed request."""
    zm = getattr(meeting, 'zoom', None)
    if not zm:
        return False

    patch_payload = {}
    settings_patch = {}

    if 'mute_upon_entry' in fields:
        settings_patch['mute_upon_entry'] = bool(fields['mute_upon_entry'])
    elif 'mute_on_entry' in fields:
        settings_patch['mute_upon_entry'] = bool(fields['mute_on_entry'])

    if 'topic' in fields or 'title' in fields:
        patch_payload['topic'] = str(fields.get('topic') or fields.get('title') or meeting.title)[:200]
    if 'agenda' in fields:
        patch_payload['agenda'] = str(fields['agenda'] or '')[:2000]
    if 'starts_at' in fields or 'ends_at' in fields:
        occ_from, occ_until = compute_occupancy_window(meeting.starts_at, meeting.ends_at)
        zm.occupies_from = occ_from
        zm.occupies_until = occ_until
        if meeting.starts_at:
            utc_start = meeting.starts_at.astimezone(datetime.timezone.utc)
            patch_payload['start_time'] = utc_start.strftime('%Y-%m-%dT%H:%M:%SZ')
            if meeting.ends_at and meeting.ends_at > meeting.starts_at:
                patch_payload['duration'] = max(
                    15, int((meeting.ends_at - meeting.starts_at).total_seconds() // 60)
                )

    if settings_patch:
        patch_payload['settings'] = settings_patch

    if not patch_payload:
        cfg = VideoPlatformSettings.load()
        patch_payload = _build_zoom_payload(meeting, cfg, zm.get_passcode())

    c = client or ZoomClient()
    try:
        c.update_meeting(zm.zoom_meeting_id, patch_payload)
        zm.sync_state = 'ok'
        zm.last_error = ''
        zm.save(update_fields=['occupies_from', 'occupies_until', 'sync_state', 'last_error', 'updated_at'])
        return True
    except ZoomError as exc:
        logger.warning('Zoom update_meeting failed for %s: %s', zm.zoom_meeting_id, exc)
        zm.sync_state = 'pending_update'
        zm.last_error = str(exc)[:1000]
        zm.save(update_fields=['occupies_from', 'occupies_until', 'sync_state', 'last_error', 'updated_at'])
        return False


def end_zoom_meeting(meeting, *, client: ZoomClient | None = None) -> bool:
    """End a live Zoom meeting via PUT /meetings/{id}/status {"action":"end"}. Never raises."""
    zm = getattr(meeting, 'zoom', None)
    if not zm:
        return False

    from .signature import release_host_claim

    release_host_claim(meeting)
    c = client or ZoomClient()
    ok = True
    try:
        c.end_meeting(zm.zoom_meeting_id)
    except ZoomNotFound:
        pass
    except ZoomError as exc:
        logger.warning('Zoom end_meeting error for %s: %s', zm.zoom_meeting_id, exc)
        zm.last_error = str(exc)[:1000]
        ok = False

    zm.is_live = False
    zm.ended_at = timezone.now()
    zm.save(update_fields=['is_live', 'ended_at', 'last_error', 'updated_at'])
    return ok


def delete_zoom_meeting(meeting, *, client: ZoomClient | None = None) -> bool:
    """Delete a Zoom meeting (ending it first if live). Never raises into a committed request."""
    zm = getattr(meeting, 'zoom', None)
    if not zm:
        return False

    c = client or ZoomClient()
    if zm.is_live:
        end_zoom_meeting(meeting, client=c)

    try:
        c.delete_meeting(zm.zoom_meeting_id)
        zm.sync_state = 'ok'
        zm.last_error = ''
        if zm.pk:
            zm.save(update_fields=['sync_state', 'last_error', 'updated_at'])
        return True
    except ZoomNotFound:
        return True
    except ZoomError as exc:
        logger.warning('Zoom delete_meeting failed for %s: %s', zm.zoom_meeting_id, exc)
        if zm.pk:
            zm.sync_state = 'pending_delete'
            zm.last_error = str(exc)[:1000]
            zm.save(update_fields=['sync_state', 'last_error', 'updated_at'])
        return False


def reconcile_pending_zoom_meeting(zm: ZoomMeeting, *, client: ZoomClient | None = None) -> tuple[bool, str]:
    """Retry pending_update or pending_delete for a single ZoomMeeting."""
    c = client or ZoomClient()
    if zm.sync_state == 'pending_delete':
        try:
            c.delete_meeting(zm.zoom_meeting_id)
        except ZoomNotFound:
            pass
        except ZoomError as exc:
            zm.last_error = str(exc)[:1000]
            zm.save(update_fields=['last_error', 'updated_at'])
            return False, str(exc)
        zm.sync_state = 'ok'
        zm.last_error = ''
        zm.save(update_fields=['sync_state', 'last_error', 'updated_at'])
        return True, ''

    if zm.sync_state in ('pending_update', 'error'):
        ok = update_zoom_meeting(zm.meeting, client=c)
        zm.refresh_from_db()
        return ok, zm.last_error

    return True, ''
