import hashlib
import hmac
import json
import logging
import time
import uuid as uuid_mod
from django.conf import settings
from django.db import IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from core.models import Profile
from realtime.publish import send as ws_send

from .. import access
from ..models import GuestSession, MeetingCheckin
from ..models_zoom import (
    VideoPlatformSettings,
    ZoomMeeting,
    ZoomParticipantSession,
    ZoomWebhookEvent,
)
from ..views import _fmt_time_12h
from .signature import get_host_claimant, release_host_claim

logger = logging.getLogger(__name__)

WEBHOOK_REPLAY_WINDOW_SEC = 300


def compute_webhook_signature(secret: str, timestamp: str, raw_body: str) -> str:
    message = f'v0:{timestamp}:{raw_body}'.encode('utf-8')
    digest = hmac.new(secret.encode('utf-8'), message, hashlib.sha256).hexdigest()
    return f'v0={digest}'


def verify_webhook_request(secret: str, signature: str, timestamp: str, raw_body: str) -> bool:
    if not (secret and signature and timestamp):
        return False
    try:
        ts_int = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - ts_int) > WEBHOOK_REPLAY_WINDOW_SEC:
        return False
    expected = compute_webhook_signature(secret, timestamp, raw_body)
    return hmac.compare_digest(signature, expected)


def _compute_dedupe_key(event: str, event_ts: int, obj: dict) -> str:
    obj_id = str(obj.get('id') or '')
    part = obj.get('participant') or {}
    part_id = str(part.get('participant_uuid') or part.get('user_id') or part.get('id') or '')
    raw = f'{event}:{event_ts}:{obj_id}:{part_id}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _resolve_identity(zm: ZoomMeeting, customer_key: str):
    profile = None
    guest = None
    if not customer_key:
        return None, None
    if customer_key.startswith('guest-'):
        gid_str = customer_key[len('guest-'):]
        if gid_str.isdigit():
            guest = GuestSession.objects.filter(pk=int(gid_str), meeting=zm.meeting).first()
        return None, guest
    try:
        uid = uuid_mod.UUID(customer_key)
        profile = Profile.objects.filter(pk=uid).first()
    except (ValueError, TypeError):
        profile = None
    return profile, None


def _process_event(event: str, obj: dict) -> None:
    raw_id = obj.get('id')
    if raw_id is None:
        return
    try:
        zoom_id = int(raw_id)
    except (ValueError, TypeError):
        return

    zm = ZoomMeeting.objects.select_related('meeting').filter(zoom_meeting_id=zoom_id).first()
    if not zm:
        return
    m = zm.meeting
    now = timezone.now()

    if event == 'meeting.started':
        zm.is_live = True
        if not zm.started_at:
            zm.started_at = now
        zm.save(update_fields=['is_live', 'started_at', 'updated_at'])
        if m.status == 'scheduled':
            m.status = 'in_progress'
            m.save(update_fields=['status', 'updated_at'])
        ws_send(f'mtg.{m.pk}', {'type': 'status', 'status': m.status, 'live': True})

    elif event == 'meeting.ended':
        zm.is_live = False
        zm.ended_at = now
        zm.save(update_fields=['is_live', 'ended_at', 'updated_at'])
        release_host_claim(m)
        ws_send(f'mtg.{m.pk}', {'type': 'status', 'status': m.status, 'live': False})

    elif event == 'meeting.participant_joined':
        part = obj.get('participant') or {}
        customer_key = str(part.get('customer_key') or '').strip()[:64]
        part_user_id = str(part.get('user_id') or '').strip()[:64]
        part_uuid = str(part.get('participant_uuid') or part.get('id') or '').strip()[:128]
        user_name = str(part.get('user_name') or 'Participant').strip()[:120]

        profile, guest = _resolve_identity(zm, customer_key)
        session_qs = ZoomParticipantSession.objects.filter(
            zoom_meeting=zm,
            left_at__isnull=True,
        )
        if part_uuid:
            existing = session_qs.filter(participant_uuid=part_uuid).first()
        elif customer_key:
            existing = session_qs.filter(customer_key=customer_key).first()
        else:
            existing = None

        if existing:
            existing.participant_user_id = part_user_id or existing.participant_user_id
            existing.name = user_name or existing.name
            existing.profile = profile or existing.profile
            existing.guest = guest or existing.guest
            existing.save()
        else:
            ZoomParticipantSession.objects.create(
                zoom_meeting=zm,
                profile=profile,
                guest=guest,
                customer_key=customer_key,
                participant_user_id=part_user_id,
                participant_uuid=part_uuid,
                name=user_name,
                joined_at=now,
            )

        if profile:
            checkin, _ = MeetingCheckin.objects.get_or_create(meeting=m, profile=profile)
            display_name = (
                profile.full_name if hasattr(profile, 'full_name') and profile.full_name else str(profile)
            )
            ws_send(
                f'mtg.{m.pk}',
                {
                    'type': 'checkin',
                    'name': display_name,
                    'at': _fmt_time_12h(checkin.joined_at),
                },
            )
            cfg = VideoPlatformSettings.load()
            if (
                cfg.zoom_auto_cohost_managers
                and access.is_manager(profile, m)
                and get_host_claimant(m) != str(profile.pk)
            ):
                ws_send(
                    f'mtg.{m.pk}.hosts',
                    {
                        'type': 'promote',
                        'participantId': part_user_id,
                        'customerKey': str(profile.pk),
                    },
                )

    elif event == 'meeting.participant_left':
        part = obj.get('participant') or {}
        customer_key = str(part.get('customer_key') or '').strip()[:64]
        part_uuid = str(part.get('participant_uuid') or part.get('id') or '').strip()[:128]
        leave_reason = str(part.get('leave_reason') or '')[:200]

        open_qs = ZoomParticipantSession.objects.filter(zoom_meeting=zm, left_at__isnull=True)
        if part_uuid and open_qs.filter(participant_uuid=part_uuid).exists():
            open_qs.filter(participant_uuid=part_uuid).update(left_at=now, leave_reason=leave_reason)
        elif customer_key:
            open_qs.filter(customer_key=customer_key).update(left_at=now, leave_reason=leave_reason)

        if customer_key:
            release_host_claim(m, customer_key=customer_key)

    elif event == 'meeting.deleted':
        zm.sync_state = 'error'
        zm.is_live = False
        zm.last_error = 'Meeting was deleted directly on Zoom outside WDOS.'
        zm.save(update_fields=['sync_state', 'is_live', 'last_error', 'updated_at'])


@csrf_exempt
@require_POST
def zoom_webhook_view(request):
    secret = getattr(settings, 'ZOOM_WEBHOOK_SECRET_TOKEN', '') or ''
    if not secret:
        return JsonResponse({'error': 'Webhook secret not configured.'}, status=503)

    raw_body = request.body.decode('utf-8', errors='replace')
    try:
        data = json.loads(raw_body) if raw_body else {}
    except ValueError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    event = str(data.get('event') or '')

    # 1. Zoom Event Subscription URL validation handshake
    if event == 'endpoint.url_validation':
        plain_token = str((data.get('payload') or {}).get('plainToken') or '')
        if not plain_token:
            return JsonResponse({'error': 'Missing plainToken.'}, status=400)
        encrypted_token = hmac.new(
            secret.encode('utf-8'),
            plain_token.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        return JsonResponse({'plainToken': plain_token, 'encryptedToken': encrypted_token})

    # 2. Verify HMAC-SHA256 signature and 300s timestamp replay window
    sig_header = request.headers.get('x-zm-signature', '') or request.META.get('HTTP_X_ZM_SIGNATURE', '')
    ts_header = request.headers.get('x-zm-request-timestamp', '') or request.META.get(
        'HTTP_X_ZM_REQUEST_TIMESTAMP', ''
    )
    if not verify_webhook_request(secret, sig_header, ts_header, raw_body):
        return JsonResponse({'error': 'Invalid webhook signature or stale timestamp.'}, status=401)

    event_ts = int(data.get('event_ts') or int(ts_header) or 0)
    obj = (data.get('payload') or {}).get('object') or {}
    dedupe_key = _compute_dedupe_key(event, event_ts, obj)

    # 3. Idempotent event recording
    try:
        wh_row, created = ZoomWebhookEvent.objects.get_or_create(
            dedupe_key=dedupe_key,
            defaults={
                'event': event,
                'event_ts': event_ts,
                'payload': data,
            },
        )
    except IntegrityError:
        return JsonResponse({'ok': True, 'duplicate': True})

    if not created:
        return JsonResponse({'ok': True, 'duplicate': True})

    try:
        _process_event(event, obj)
        wh_row.processed_at = timezone.now()
        wh_row.save(update_fields=['processed_at'])
    except Exception as exc:
        logger.exception('Error processing Zoom webhook %s (%s)', event, dedupe_key)
        wh_row.error = str(exc)[:1000]
        wh_row.save(update_fields=['error'])

    return JsonResponse({'ok': True})
