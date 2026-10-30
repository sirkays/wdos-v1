import secrets

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import F
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from core.models import OrgUnit, Profile
from onboarding.views import gate_open
from operations.models import Meeting, MeetingAttendance

from . import access, livekit
from .forms import MeetingForm
from .models import MeetingCheckin, MeetingFile, TranscriptSegment
from .translation.logic import draft_minutes


def _ctx(request, **kw):
    return dict({'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr', 'tab': 'meetings', 'locked': False}, **kw)


def _guard(request):
    return None if gate_open(request.user) else redirect('onboarding:start')


def _managed_units(user):
    if user.is_superuser or user.is_in_hq():
        return OrgUnit.objects.all()
    r = access.reach(user)
    if r:
        return OrgUnit.objects.filter(pk__in=r)
    unit, _ = access.user_unit(user)
    if unit:
        return OrgUnit.objects.filter(pk=unit.pk)
    return OrgUnit.objects.filter(is_active=True)


def _get(request, pk):
    m = get_object_or_404(Meeting, pk=pk)
    if not access.can_see(request.user, m):
        raise Http404
    return m


@login_required
def list_view(request):
    if (g := _guard(request)):
        return g
    qs = access.visible_meetings(request.user).select_related('org_unit', 'organiser')
    now = timezone.now()
    return render(request, 'meetings/list.html', _ctx(
        request, upcoming=qs.filter(Q_upcoming(now)).exclude(status__in=('cancelled', 'completed')).order_by(F('starts_at').asc(nulls_last=True), '-created_at')[:50],
        past=qs.filter(Q_past(now))[:50], can_create=_managed_units(request.user).exists()))


def Q_upcoming(now):
    from django.db.models import Q
    return Q(ends_at__gte=now) | Q(ends_at__isnull=True)


def Q_past(now):
    from django.db.models import Q
    return Q(ends_at__lt=now) | Q(status__in=('completed', 'cancelled'))


@login_required
def create_view(request):
    if (g := _guard(request)):
        return g
    units = _managed_units(request.user)
    if not units.exists():
        raise Http404
    initial = {
        'mode': 'virtual',
        'platform': 'woddi',
        'audience': 'unit',
    }
    if units.count() == 1:
        initial['org_unit'] = units.first()
    form = MeetingForm(request.POST or None, initial=initial, units=units)
    if request.method == 'POST' and form.is_valid():
        m = form.save(commit=False)
        m.organiser = request.user
        m.platform = 'woddi'
        if m.access == 'anyone':
            m.guest_code = secrets.token_urlsafe(16)
        if not m.location:
            m.location = 'WODDI Room'
        m.save()
        return redirect('meetings:detail', pk=m.pk)
    return render(request, 'meetings/form.html', _ctx(request, form=form))


def _passcode_ok(request, m):
    if not m.passcode or access.is_manager(request.user, m):
        return True
    return request.session.get(f'passcode_ok_{m.pk}') == m.passcode


@login_required
def detail_view(request, pk):
    if (g := _guard(request)):
        return g
    m = _get(request, pk)
    if request.GET.get('ended') == '1':
        messages.success(request, 'The meeting has ended for everyone.')
    elif request.GET.get('removed') == '1':
        if m.status == 'completed':
            messages.info(request, 'The host ended the meeting.')
        else:
            messages.warning(request, 'You were removed from the meeting room by the host.')
    elif request.GET.get('elsewhere') == '1':
        messages.warning(request, 'You left the WODDI Room here because your account joined it from another tab or device.')
    elif request.GET.get('dropped') == '1':
        if m.status == 'completed':
            messages.info(request, 'The host ended the meeting.')
        else:
            messages.warning(request, 'Your connection to the WODDI Room was lost. Check your internet connection and join again.')
    mgr = access.is_manager(request.user, m)
    people = access.invitees(m).order_by('last_name', 'first_name')[:300] if mgr else []
    marks = {a.profile_id: a.present for a in m.attendance_records.all()}
    joined = set(m.checkins.values_list('profile_id', flat=True))
    sheet = [{'p': p, 'present': marks.get(p.pk, p.pk in joined)} for p in people]
    now = timezone.now()
    return render(request, 'meetings/detail.html', _ctx(
        request, m=m, mgr=mgr, sheet=sheet, checkins=m.checkins.select_related('profile'),
        files=m.files.all(), joined_me=request.user.pk in joined,
        langs=LANGS, my_lang=_my_lang(request.user),
        passcode_unlocked=_passcode_ok(request, m),
        draft_active=bool(mgr and request.GET.get('draft')),
        minutes_text=(draft_minutes(m, m.transcript.all(), [c.profile.full_name for c in m.checkins.select_related('profile')])
                      if mgr and request.GET.get('draft') else m.minutes),
        has_transcript=m.transcript.exists(), usage=getattr(m, 'translation_usage', None),
        time_elapsed=bool(m.ends_at) and m.status in ('scheduled', 'in_progress') and now > m.ends_at + timezone.timedelta(minutes=30),
        live=_room_open(m)))


@login_required
@require_POST
def join_view(request, pk):
    m = _get(request, pk)
    if m.status in ('completed', 'cancelled'):
        return redirect('meetings:detail', pk=pk)
    if not _passcode_ok(request, m):
        entered = request.POST.get('passcode', '').strip()
        if entered and entered == m.passcode:
            request.session[f'passcode_ok_{m.pk}'] = m.passcode
        else:
            messages.error(request, 'Incorrect room passcode. Please enter the passcode provided by the host.')
            return redirect('meetings:detail', pk=pk)
    MeetingCheckin.objects.get_or_create(meeting=m, profile=request.user)
    # The listening language is chosen here, before entering; it cannot be changed from inside the room.
    lang = request.POST.get('lang', '')
    if lang in dict(LANGS) and lang != request.user.preferred_locale:
        request.user.preferred_locale = lang
        request.user.save(update_fields=['preferred_locale'])
    if m.status == 'scheduled' and access.is_manager(request.user, m) and (m.platform != 'woddi' or _room_open(m)):
        m.status = 'in_progress'
        m.save(update_fields=['status', 'updated_at'])
    if m.platform in ('zoom', 'meet', 'other') and m.location.startswith(('http://', 'https://')):
        return redirect(m.location)
    if m.platform == 'woddi':
        return redirect('meetings:room', pk=pk)
    return redirect('meetings:detail', pk=pk)


def _fmt_12h(dt):
    if not dt:
        return ''
    """Format a timezone-aware datetime as a clear 12-hour clock string (e.g. 'Thu 29 Oct 2026, 7:00 PM')."""
    loc = timezone.localtime(dt)
    hour12 = loc.hour % 12 or 12
    ampm = 'AM' if loc.hour < 12 else 'PM'
    return f"{loc.strftime('%a %d %b %Y')}, {hour12}:{loc.strftime('%M')} {ampm} {loc.strftime('%Z')}"


def _fmt_time_12h(dt):
    loc = timezone.localtime(dt)
    hour12 = loc.hour % 12 or 12
    ampm = 'AM' if loc.hour < 12 else 'PM'
    return f"{hour12}:{loc.strftime('%M')} {ampm}"


@login_required
def live_view(request, pk):
    m = _get(request, pk)
    return JsonResponse({'count': m.checkins.count(), 'status': m.status, 'people': [
        {'name': c.profile.full_name if hasattr(c.profile, 'full_name') else str(c.profile), 'at': _fmt_time_12h(c.joined_at)}
        for c in m.checkins.select_related('profile')]})


def _manager_only(request, pk):
    m = _get(request, pk)
    if not access.is_manager(request.user, m):
        raise Http404
    return m


@login_required
@require_POST
def attendance_view(request, pk):
    m = _manager_only(request, pk)
    present = set(request.POST.getlist('present'))
    for p in access.invitees(m):
        MeetingAttendance.objects.update_or_create(
            meeting=m, profile=p, defaults={'present': str(p.pk) in present, 'recorded_by': request.user, 'recorded_at': timezone.now()})
    return redirect('meetings:detail', pk=pk)


@login_required
@require_POST
def close_view(request, pk):
    m = _manager_only(request, pk)
    m.minutes = request.POST.get('minutes', '').strip()[:8000]
    m.status = 'completed'
    m.save()
    return redirect('meetings:detail', pk=pk)


@login_required
@require_POST
def control_view(request, pk):
    """A moderator's command for people in the live room: allow or lock mic / camera / screen sharing, lower a raised hand, or
    remove someone. It is sent from the server (after checking the caller manages this meeting), and browsers only obey
    commands that come from the server, so a participant cannot forge one over the room's data channel."""
    m = _manager_only(request, pk)
    target = request.POST.get('target', '').strip()
    if not target:
        return JsonResponse({'error': 'Choose who this is for.'}, status=400)
    if request.POST.get('kick') == '1':
        if target == '*':
            return JsonResponse({'error': 'Remove people one at a time.'}, status=400)
        livekit.remove_participant(m, target)     # tells them why, then disconnects them
        return JsonResponse({'ok': True})
    payload = {'target': target}
    for key in ('mic', 'cam', 'share'):
        value = request.POST.get(key)
        if value in ('0', '1'):
            payload[key] = value == '1'
    if request.POST.get('lowerHand') == '1':
        payload['lowerHand'] = True
    if len(payload) == 1:
        return JsonResponse({'error': 'Nothing to change.'}, status=400)
    livekit.push(livekit.room_name(m), 'wdos_media_ctrl', payload, None if target == '*' else [target])
    return JsonResponse({'ok': True})


@login_required
@require_POST
def end_view(request, pk):
    """Host ends the meeting for everyone: the room closes, everyone in it is disconnected, nobody can rejoin.
    The meeting is marked completed so the host can still write the minutes afterwards."""
    m = _manager_only(request, pk)
    if m.status not in ('completed', 'cancelled'):
        m.status = 'completed'
        m.save(update_fields=['status', 'updated_at'])
    livekit.end_room(m)
    if request.headers.get('x-requested-with') == 'fetch':
        return JsonResponse({'ok': True})
    return redirect(f"{redirect('meetings:detail', pk=pk).url}?ended=1")


@login_required
@require_POST
def cancel_view(request, pk):
    m = _manager_only(request, pk)
    if m.status == 'scheduled':
        m.status = 'cancelled'
        m.save(update_fields=['status', 'updated_at'])
    return redirect('meetings:detail', pk=pk)


@login_required
@require_POST
def delete_view(request, pk):
    """Permanently delete a meeting (managers only). If the room is live, close it for everyone first."""
    m = _manager_only(request, pk)
    title = m.title
    livekit.end_room(m)
    m.delete()
    messages.success(request, f'Meeting "{title}" has been deleted.')
    return redirect('meetings:list')


@login_required
@require_POST
def upload_view(request, pk):
    m = _manager_only(request, pk)
    f = request.FILES.get('file')
    if f and f.size <= 20 * 1024 * 1024:
        MeetingFile.objects.create(meeting=m, name=f.name[:200], file=f, uploaded_by=request.user)
    return redirect('meetings:detail', pk=pk)


@login_required
def download_view(request, pk, file_id):
    m = _get(request, pk)
    f = get_object_or_404(MeetingFile, pk=file_id, meeting=m)
    return FileResponse(f.file.open('rb'), as_attachment=True, filename=f.name)


# ---- WODDI Room (LiveKit) -------------------------------------------------
LANGS = [
    ('en', 'English'),
    ('fr', 'Français'),
    ('pt', 'Português'),
    ('ar', 'العربية'),
    ('sw', 'Kiswahili'),
]


def _my_lang(user):
    """The member's listening language, limited to the room's supported set (falls back to English)."""
    return user.preferred_locale if user.preferred_locale in dict(LANGS) else 'en'


def _room_open(m):
    """Open from 15 minutes before the start until the meeting ends; never once completed or cancelled."""
    now = timezone.now()
    if not (m.platform == 'woddi' and m.status in ('scheduled', 'in_progress')):
        return False
    if m.starts_at and now < m.starts_at - timezone.timedelta(minutes=15):
        return False
    if m.ends_at and now > m.ends_at + timezone.timedelta(minutes=30):
        return False
    return True


@login_required
def room_view(request, pk):
    if (g := _guard(request)):
        return g
    m = _get(request, pk)
    if not _room_open(m):
        now = timezone.now()
        if m.status == 'cancelled':
            messages.warning(request, 'This meeting was cancelled, so the WODDI Room is closed.')
        elif m.status == 'completed':
            messages.info(request, 'This meeting has ended, so the WODDI Room is closed.')
        elif m.ends_at and now > m.ends_at:
            messages.warning(request, 'The scheduled time for this meeting has elapsed (starts %s · ends %s), so the WODDI Room is closed.' % (_fmt_12h(m.starts_at), _fmt_12h(m.ends_at)))
        elif not m.starts_at:
            messages.info(request, 'The WODDI Room is not available for this meeting.')
        else:
            opens = m.starts_at - timezone.timedelta(minutes=15)
            messages.info(request, 'The WODDI Room opens 15 minutes before the start time, at %s (Meeting starts: %s · ends: %s).' % (_fmt_12h(opens), _fmt_12h(m.starts_at), _fmt_12h(m.ends_at)))
        return redirect('meetings:detail', pk=pk)
    if not _passcode_ok(request, m):
        messages.error(request, 'This room requires a passcode to join.')
        return redirect('meetings:detail', pk=pk)
    MeetingCheckin.objects.get_or_create(meeting=m, profile=request.user)
    missing = livekit.missing_settings()
    return render(request, 'meetings/room.html', _ctx(
        request, m=m, langs=LANGS, my_lang=_my_lang(request.user), mgr=access.is_manager(request.user, m),
        missing=missing if request.user.is_in_hq() else (['configuration'] if missing else [])))


@login_required
def token_view(request, pk):
    m = _get(request, pk)
    if not _room_open(m):
        return JsonResponse({'error': 'This room is not open.'}, status=403)
    if not _passcode_ok(request, m):
        return JsonResponse({'error': 'Passcode required.'}, status=403)
    if livekit.missing_settings():
        return JsonResponse({'error': 'The video service is not configured yet.'}, status=503)
    mod = access.is_manager(request.user, m)
    token = livekit.make_token(request.user, m, mod, _my_lang(request.user))
    return JsonResponse({'url': livekit.settings.LIVEKIT_URL, 'token': token, 'moderator': mod})


@login_required
def transcript_view(request, pk):
    """Managers download the full transcript with every translation."""
    from django.http import HttpResponse
    m = _manager_only(request, pk)
    out = []
    for s in m.transcript.all():
        out.append(f"[{s.created_at:%H:%M:%S}] {s.speaker} ({s.lang}): {s.text}")
        out += [f"      {k}: {v}" for k, v in s.translations.items()]
    r = HttpResponse('\n'.join(out), content_type='text/plain; charset=utf-8')
    r['Content-Disposition'] = f'attachment; filename="transcript-{m.pk}.txt"'
    return r
