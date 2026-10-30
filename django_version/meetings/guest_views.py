"""Guest access: anyone holding the private link may join a meeting set to "Anyone with the link".
Waiting room by default; the host or a moderator admits each guest. Guests never see the workspace."""
from django.core.cache import cache
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required

from operations.models import Meeting

from . import access, livekit
from .models import GuestSession
from .views import LANGS, _manager_only, _room_open

MAX_GUESTS = 100
JOIN_LIMIT = (20, 600)    # 20 attempts per IP per 10 minutes


def _meeting_any(code):
    if not code:
        raise Http404
    return get_object_or_404(Meeting, guest_code=code, access='anyone')


def _is_ended(m):
    return m.status in ('completed', 'cancelled') or bool(m.ends_at and timezone.now() > m.ends_at + timezone.timedelta(minutes=30))


def _meeting(code):
    m = _meeting_any(code)
    if _is_ended(m):
        raise Http404
    return m


def _ip(request):
    return (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', ''))


def _guest(request, m):
    gid = request.session.get(f'guest_{m.pk}')
    g = GuestSession.objects.filter(pk=gid, meeting=m).first() if gid else None
    return g if g and g.status != 'removed' else None


def _ctx(request, **kw):
    return dict({'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr'}, **kw)


def join_view(request, code):
    m = _meeting_any(code)
    if _is_ended(m):
        return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
    g = _guest(request, m)
    if g:
        return redirect('meetings:guest_wait', code=code)
    error = ''
    if request.method == 'POST':
        key = f'guestjoin:{_ip(request)}'
        n = cache.get(key, 0)
        name = ' '.join(request.POST.get('name', '').split())[:60]
        lang = request.POST.get('lang', 'en')
        passcode = request.POST.get('passcode', '').strip()
        if n >= JOIN_LIMIT[0]:
            error = 'Too many attempts. Please wait a few minutes.'
        elif len(name) < 2:
            error = 'Please enter your name.'
        elif lang not in dict(LANGS):
            error = 'Please choose a language.'
        elif m.passcode and passcode != m.passcode:
            cache.set(key, n + 1, JOIN_LIMIT[1])
            error = 'Incorrect room passcode. Please check with the host.'
        elif m.guests.exclude(status='removed').count() >= MAX_GUESTS:
            error = 'This meeting is full.'
        else:
            cache.set(key, n + 1, JOIN_LIMIT[1])
            now = timezone.now()
            g = GuestSession.objects.create(
                meeting=m, name=name, lang=lang,
                status='admitted' if m.guest_auto_admit else 'waiting', admitted_at=now if m.guest_auto_admit else None)
            request.session[f'guest_{m.pk}'] = g.pk
            if g.status == 'waiting':
                livekit.notify_hosts(m)
            return redirect('meetings:guest_wait', code=code)
    left = request.GET.get('left') == '1'
    cancelled = request.GET.get('cancelled') == '1'
    removed = request.GET.get('removed') == '1'
    dropped = request.GET.get('dropped') == '1'
    return render(request, 'meetings/guest_join.html', _ctx(request, m=m, langs=LANGS, error=error, left=left, cancelled=cancelled, removed=removed, dropped=dropped))


def leave_view(request, code):
    """Guest voluntarily leaves the meeting or cancels waiting: clear their session so they are not bounced back into the room."""
    m = _meeting_any(code)
    g = _guest(request, m)
    request.session.pop(f'guest_{m.pk}', None)
    if g:
        g.status = 'removed'
        g.save(update_fields=['status'])
        livekit.remove_participant(m, g.identity)
        livekit.notify_hosts(m)
    if request.GET.get('removed'):
        param = 'removed=1'
    elif request.GET.get('dropped') or request.GET.get('elsewhere'):
        param = 'dropped=1'
    elif request.GET.get('cancelled'):
        param = 'cancelled=1'
    else:
        param = 'left=1'
    return redirect(f"{redirect('meetings:guest_join', code=code).url}?{param}")


def wait_view(request, code):
    m = _meeting_any(code)
    if _is_ended(m):
        return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
    g = _guest(request, m)
    if not g:
        return redirect('meetings:guest_join', code=code)
    if g.status == 'admitted':
        return redirect('meetings:guest_room', code=code)
    return render(request, 'meetings/guest_wait.html', _ctx(request, m=m, g=g))


def status_view(request, code):
    m = _meeting(code)
    g = _guest(request, m)
    return JsonResponse({'status': g.status if g else 'removed'})


def room_view(request, code):
    m = _meeting_any(code)
    if _is_ended(m):
        return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
    g = _guest(request, m)
    if not g or g.status != 'admitted':
        return redirect('meetings:guest_wait', code=code)
    if not _room_open(m):
        if m.ends_at and timezone.now() > m.ends_at:
            return render(request, 'meetings/guest_ended.html', _ctx(request, m=m))
        opens_in = int((m.starts_at - timezone.timedelta(minutes=15) - timezone.now()).total_seconds()) if m.starts_at else 0
        return render(request, 'meetings/guest_wait.html', _ctx(request, m=m, g=g, early=True, opens_in=max(opens_in, 0)))
    missing = livekit.missing_settings()
    return render(request, 'meetings/guest_room.html', _ctx(
        request, m=m, g=g, langs=LANGS, my_lang=g.lang, missing=['configuration'] if missing else []))


def token_view(request, code):
    m = _meeting(code)
    g = _guest(request, m)
    if not g or g.status != 'admitted' or not _room_open(m):
        return JsonResponse({'error': 'Not allowed.'}, status=403)
    if livekit.missing_settings():
        return JsonResponse({'error': 'The video service is not configured yet.'}, status=503)
    return JsonResponse({'url': livekit.settings.LIVEKIT_URL, 'token': livekit.make_guest_token(g, m), 'moderator': False})


def lobby_token_view(request, code):
    """Token for the waiting guest's private lobby room: lets the server push 'admitted' / 'removed' instantly."""
    m = _meeting(code)
    g = _guest(request, m)
    if not g or g.status == 'removed':
        return JsonResponse({'error': 'Not allowed.'}, status=403)
    if livekit.missing_settings():
        return JsonResponse({'error': 'The video service is not configured yet.'}, status=503)
    return JsonResponse({'url': livekit.settings.LIVEKIT_URL, 'token': livekit.make_lobby_token(g, m)})


# ---- host / moderator tools (members only) ---------------------------------
@login_required
def guests_json_view(request, pk):
    m = _manager_only(request, pk)
    return JsonResponse({'waiting': [{'id': g.pk, 'name': g.name, 'lang': g.lang} for g in m.guests.filter(status='waiting')],
                         'in': [{'id': g.pk, 'name': g.name} for g in m.guests.filter(status='admitted')]})


@login_required
@require_POST
def guest_action_view(request, pk, gid, action):
    m = _manager_only(request, pk)
    g = get_object_or_404(GuestSession, pk=gid, meeting=m)
    if action == 'admit' and g.status == 'waiting':
        g.status, g.admitted_at = 'admitted', timezone.now()
        g.save(update_fields=['status', 'admitted_at'])
        livekit.notify_guest(m, g, 'admitted')
    elif action == 'remove':
        g.status = 'removed'
        g.save(update_fields=['status'])
        livekit.remove_participant(m, g.identity)
        livekit.notify_guest(m, g, 'removed')
    else:
        return JsonResponse({'error': 'Not allowed.'}, status=400)
    livekit.notify_hosts(m)      # other hosts/moderators refresh their lists instantly
    if request.headers.get('x-requested-with') == 'fetch':
        return JsonResponse({'ok': True})
    return redirect('meetings:detail', pk=pk)


@login_required
@require_POST
def guest_link_view(request, pk):
    """Turn guest access on/off, regenerate the link, flip auto-admit, manage the room passcode, or set 'join muted'."""
    import secrets
    m = _manager_only(request, pk)
    act = request.POST.get('action')
    if act in ('on', 'regen'):
        m.access, m.guest_code = 'anyone', secrets.token_urlsafe(16)
    elif act == 'off':
        m.access, m.guest_code = 'members', ''
        for g in m.guests.filter(status__in=('waiting', 'admitted')):
            g.status = 'removed'
            g.save(update_fields=['status'])
            livekit.remove_participant(m, g.identity)
            livekit.notify_guest(m, g, 'removed')
    elif act in ('auto_on', 'auto_off'):
        m.guest_auto_admit = act == 'auto_on'
    elif act in ('mute_entry_on', 'mute_entry_off'):
        m.mute_on_entry = act == 'mute_entry_on'
    elif act in ('passcode_on', 'passcode_regen'):
        custom = request.POST.get('passcode', '').strip()[:32]
        m.passcode = custom if (act == 'passcode_on' and custom) else f'{secrets.randbelow(900000) + 100000}'
    elif act == 'passcode_set':
        custom = request.POST.get('passcode', '').strip()[:32]
        m.passcode = custom or f'{secrets.randbelow(900000) + 100000}'
    elif act == 'passcode_off':
        m.passcode = ''
    m.save()
    if request.headers.get('x-requested-with') == 'fetch':      # the in-room switch toggles without leaving the call
        return JsonResponse({'ok': True, 'mute_on_entry': m.mute_on_entry})
    return redirect('meetings:detail', pk=pk)
