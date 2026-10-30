from functools import wraps
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.cache import caches
from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from realtime.publish import send as ws_send
from realtime.tickets import issue as issue_ws_ticket

from . import access
from .guest_views import _guest, _ip, _is_ended, _meeting, _meeting_any
from .models import MeetingCheckin
from .platform import missing_zoom_settings
from .views import LANGS, _ctx, _fmt_12h, _fmt_time_12h, _get, _guard, _my_lang, _passcode_ok
from .zoom.client import ZoomError
from .zoom.sdk import map_zoom_lang, sdk_assets
from .zoom.signature import claim_host_slot, make_sdk_signature
from .zoom.zak import get_host_zak

SIG_RATE_LIMIT = (20, 60)  # 20 signature requests per 60 seconds


def _cache():
    try:
        return caches['zoom']
    except Exception:
        return caches['default']


def cross_origin_isolated(view_func):
    """Apply COOP/COEP headers ONLY to the Zoom room pages so SharedArrayBuffer (25-tile gallery + HD) is enabled."""
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        response = view_func(request, *args, **kwargs)
        response['Cross-Origin-Opener-Policy'] = 'same-origin'
        response['Cross-Origin-Embedder-Policy'] = 'require-corp'
        response['Cache-Control'] = 'no-store'
        return response

    return _wrapped


def zoom_open(m) -> bool:
    """Open from 15 minutes before start until 30 minutes after end; never once completed or cancelled."""
    now = timezone.now()
    if not (m.platform == 'zoom' and m.status in ('scheduled', 'in_progress') and hasattr(m, 'zoom')):
        return False
    if m.starts_at and now < m.starts_at - timezone.timedelta(minutes=15):
        return False
    if m.ends_at and now > m.ends_at + timezone.timedelta(minutes=30):
        return False
    return True


def record_zoom_checkin(m, profile) -> None:
    """Idempotently record a member check-in and broadcast a realtime checkin event."""
    checkin, created = MeetingCheckin.objects.get_or_create(meeting=m, profile=profile)
    if created:
        name = profile.full_name if hasattr(profile, 'full_name') and profile.full_name else str(profile)
        ws_send(
            f'mtg.{m.pk}',
            {
                'type': 'checkin',
                'name': name,
                'at': _fmt_time_12h(checkin.joined_at),
            },
        )


@login_required
@cross_origin_isolated
def zoom_room_view(request, pk):
    if (g := _guard(request)):
        return g
    m = _get(request, pk)
    if not zoom_open(m):
        now = timezone.now()
        if m.status == 'cancelled':
            messages.warning(request, 'This meeting was cancelled, so the Zoom room is closed.')
        elif m.status == 'completed':
            messages.info(request, 'This meeting has ended, so the Zoom room is closed.')
        elif m.ends_at and now > m.ends_at:
            messages.warning(
                request,
                'The scheduled time for this meeting has elapsed (starts %s · ends %s), so the room is closed.'
                % (_fmt_12h(m.starts_at), _fmt_12h(m.ends_at)),
            )
        elif not m.starts_at or not hasattr(m, 'zoom'):
            messages.info(request, 'The Zoom room is not available for this meeting.')
        else:
            opens = m.starts_at - timezone.timedelta(minutes=15)
            messages.info(
                request,
                'The meeting room opens 15 minutes before the start time, at %s (Meeting starts: %s · ends: %s).'
                % (_fmt_12h(opens), _fmt_12h(m.starts_at), _fmt_12h(m.ends_at)),
            )
        return redirect('meetings:detail', pk=pk)

    if not _passcode_ok(request, m):
        messages.error(request, 'This room requires a passcode to join.')
        return redirect('meetings:detail', pk=pk)

    zm = getattr(m, 'zoom', None)
    if not zm or zm.sync_state != 'ok':
        messages.error(request, 'This Zoom meeting is not ready or failed to synchronise.')
        return redirect('meetings:detail', pk=pk)

    record_zoom_checkin(m, request.user)
    mgr = access.is_manager(request.user, m)
    missing = missing_zoom_settings()
    return render(
        request,
        'meetings/zoom_room.html',
        _ctx(
            request,
            m=m,
            zm=zm,
            mgr=mgr,
            is_guest=False,
            langs=LANGS,
            my_lang=_my_lang(request.user),
            sdk=sdk_assets(),
            sig_url=reverse('meetings:zoom_signature', args=[m.pk]),
            leave_url=reverse('meetings:detail', args=[m.pk]),
            ws_ticket_url=reverse('meetings:ws_ticket', args=[m.pk]),
            ws_path=f'/ws/meetings/{m.pk}/',
            ws_base=getattr(settings, 'REALTIME_WS_URL', ''),
            missing=missing if request.user.is_in_hq() else (['configuration'] if missing else []),
        ),
    )


@login_required
@require_POST
def zoom_signature_view(request, pk):
    if _guard(request):
        return JsonResponse({'error': 'Onboarding required.'}, status=403)
    m = _get(request, pk)
    if not zoom_open(m):
        return JsonResponse({'error': 'This room is not open.'}, status=403)
    if not _passcode_ok(request, m):
        return JsonResponse({'error': 'Passcode required.'}, status=403)
    zm = getattr(m, 'zoom', None)
    if not zm or zm.sync_state != 'ok':
        return JsonResponse({'error': 'Zoom meeting is not synchronized.'}, status=409)
    if missing_zoom_settings():
        return JsonResponse({'error': 'The Zoom video service is not configured yet.'}, status=503)

    # Rate limit: 20 requests / min / user
    rl_key = f'zoom:sig:rl:user:{request.user.pk}'
    cache = _cache()
    count = cache.get(rl_key, 0)
    if count >= SIG_RATE_LIMIT[0]:
        resp = JsonResponse({'error': 'Too many join attempts. Please wait a minute.'}, status=429)
        resp['Cache-Control'] = 'no-store'
        return resp
    cache.set(rl_key, count + 1, timeout=SIG_RATE_LIMIT[1])

    mgr = access.is_manager(request.user, m)
    role = 0
    zak = None
    if mgr and claim_host_slot(m, request.user):
        try:
            zak = get_host_zak(zm.host_account)
            role = 1
        except ZoomError:
            # Degrade gracefully to attendee role if ZAK fetch fails when JBH is enabled
            role = 0
            zak = None

    sig = make_sdk_signature(zm.zoom_meeting_id, role)
    user_name = (
        request.user.full_name
        if hasattr(request.user, 'full_name') and request.user.full_name
        else request.user.email
    )
    payload = {
        'sdkKey': settings.ZOOM_SDK_KEY,
        'signature': sig,
        'meetingNumber': str(zm.zoom_meeting_id),
        'password': zm.get_passcode(),
        'userName': user_name[:64],
        'userEmail': request.user.email or '',
        'customerKey': str(request.user.pk),
        'lang': map_zoom_lang(_my_lang(request.user)),
        'leaveUrl': reverse('meetings:detail', args=[m.pk]),
    }
    if role == 1 and zak:
        payload['zak'] = zak

    resp = JsonResponse(payload)
    resp['Cache-Control'] = 'no-store'
    return resp


@cross_origin_isolated
def guest_zoom_room_view(request, code):
    m = _meeting_any(code)
    if _is_ended(m):
        return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
    g = _guest(request, m)
    if not g or g.status != 'admitted':
        return redirect('meetings:guest_wait', code=code)
    if not zoom_open(m):
        if m.ends_at and timezone.now() > m.ends_at:
            return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
        opens_in = (
            int((m.starts_at - timezone.timedelta(minutes=15) - timezone.now()).total_seconds())
            if m.starts_at
            else 0
        )
        return render(
            request,
            'meetings/guest_wait_zoom.html',
            _ctx(
                request,
                m=m,
                g=g,
                early=True,
                opens_in=max(opens_in, 0),
                ws_ticket_url=reverse('meetings:guest_ws_ticket', args=[code]),
                ws_path=f'/ws/guest/{code}/',
                ws_base=getattr(settings, 'REALTIME_WS_URL', ''),
            ),
        )
    zm = getattr(m, 'zoom', None)
    if not zm or zm.sync_state != 'ok':
        return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))

    missing = missing_zoom_settings()
    return render(
        request,
        'meetings/zoom_room.html',
        _ctx(
            request,
            m=m,
            zm=zm,
            g=g,
            mgr=False,
            is_guest=True,
            langs=LANGS,
            my_lang=g.lang,
            sdk=sdk_assets(),
            sig_url=reverse('meetings:guest_zoom_signature', args=[code]),
            leave_url=reverse('meetings:guest_leave', args=[code]),
            ws_ticket_url=reverse('meetings:guest_ws_ticket', args=[code]),
            ws_path=f'/ws/guest/{code}/',
            ws_base=getattr(settings, 'REALTIME_WS_URL', ''),
            missing=['configuration'] if missing else [],
        ),
    )


@require_POST
def guest_zoom_signature_view(request, code):
    m = _meeting_any(code)
    if _is_ended(m):
        return JsonResponse({'error': 'Meeting has ended.'}, status=403)
    g = _guest(request, m)
    if not g or g.status != 'admitted' or not zoom_open(m):
        return JsonResponse({'error': 'Not allowed.'}, status=403)
    zm = getattr(m, 'zoom', None)
    if not zm or zm.sync_state != 'ok':
        return JsonResponse({'error': 'Zoom meeting is not synchronized.'}, status=409)
    if missing_zoom_settings():
        return JsonResponse({'error': 'The Zoom video service is not configured yet.'}, status=503)

    rl_key = f'zoom:sig:rl:guest:{g.pk}:{_ip(request)}'
    cache = _cache()
    count = cache.get(rl_key, 0)
    if count >= SIG_RATE_LIMIT[0]:
        resp = JsonResponse({'error': 'Too many join attempts. Please wait a minute.'}, status=429)
        resp['Cache-Control'] = 'no-store'
        return resp
    cache.set(rl_key, count + 1, timeout=SIG_RATE_LIMIT[1])

    sig = make_sdk_signature(zm.zoom_meeting_id, 0)
    payload = {
        'sdkKey': settings.ZOOM_SDK_KEY,
        'signature': sig,
        'meetingNumber': str(zm.zoom_meeting_id),
        'password': zm.get_passcode(),
        'userName': f'{g.name} (Guest)'[:64],
        'userEmail': '',
        'customerKey': f'guest-{g.pk}',
        'lang': map_zoom_lang(g.lang),
        'leaveUrl': reverse('meetings:guest_leave', args=[code]),
    }
    resp = JsonResponse(payload)
    resp['Cache-Control'] = 'no-store'
    return resp


@login_required
@require_GET
def ws_ticket_view(request, pk):
    """Issue a short-lived single-use WebSocket ticket for a member or manager viewing a meeting."""
    m = _get(request, pk)
    mgr = access.is_manager(request.user, m)
    ticket = issue_ws_ticket(
        {
            'kind': 'member',
            'sub': str(request.user.pk),
            'meeting': str(m.pk),
            'role': 'manager' if mgr else 'member',
        }
    )
    resp = JsonResponse(
        {
            'ticket': ticket,
            'wsUrl': getattr(settings, 'REALTIME_WS_URL', ''),
            'wsPath': f'/ws/meetings/{m.pk}/',
        }
    )
    resp['Cache-Control'] = 'no-store'
    return resp


@require_GET
def guest_ws_ticket_view(request, code):
    """Issue a short-lived single-use WebSocket ticket for a waiting/admitted guest's own session."""
    m = _meeting_any(code)
    if _is_ended(m):
        return JsonResponse({'error': 'Meeting has ended.'}, status=403)
    g = _guest(request, m)
    if not g:
        return JsonResponse({'error': 'Not allowed.'}, status=403)
    ticket = issue_ws_ticket(
        {
            'kind': 'guest',
            'sub': str(g.pk),
            'meeting': str(m.pk),
            'role': 'guest',
            'code': code,
        }
    )
    resp = JsonResponse(
        {
            'ticket': ticket,
            'wsUrl': getattr(settings, 'REALTIME_WS_URL', ''),
            'wsPath': f'/ws/guest/{code}/',
        }
    )
    resp['Cache-Control'] = 'no-store'
    return resp
