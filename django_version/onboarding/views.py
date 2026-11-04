import re
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import OnboardingProgress
from .steps import BY_CODE, REQUIRED_DOCS, STEPS, _completed_map, gate_open


def _status(user):
    done = {p.step_code: p for p in OnboardingProgress.objects.filter(profile=user)}
    rows = [dict(s, done_at=done[s['code']].done_at if s['code'] in done else None) for s in STEPS]
    return rows


@login_required
def start_view(request):
    rows = _status(request.user)
    current = next((r for r in rows if not r['done_at']), None)
    done = sum(1 for r in rows if r['done_at'])
    return render(request, 'onboarding/leader.html', {
        'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr',
        'steps': rows, 'current': current, 'locked': bool(current),
        'n': rows.index(current) + 1 if current else len(rows),
        'total': len(rows), 'done': done, 'percent': round(done / len(rows) * 100),
    })


@login_required
def doc_view(request, code):
    step = BY_CODE.get(code)
    doc_file = step['doc'] if (step and step.get('doc')) else (REQUIRED_DOCS.get(code, {}).get('file'))
    if not doc_file:
        raise Http404
    html = (Path(settings.STATICFILES_DIRS[0]) / 'content' / doc_file).read_text(encoding='utf-8')
    m = re.search(r'<body[^>]*>(.*)</body>', html, re.S | re.I)
    html = m.group(1) if m else html
    html = re.sub(r'<(script|style|iframe|object|embed)\b.*?</\1>|<link[^>]*>', '', html, flags=re.S | re.I)
    return HttpResponse(html)


@login_required
@require_POST
def complete_view(request, code):
    """Server enforces the evidence: reading steps need reached_end + enough time."""
    step = BY_CODE.get(code)
    if not step:
        raise Http404
    rows = _status(request.user)
    current = next((r for r in rows if not r['done_at']), None)
    if not current or current['code'] != code:
        return JsonResponse({'error': 'This is not your current step.'}, status=400)
    try:
        seconds = max(0, int(request.POST.get('seconds', 0)))
    except ValueError:
        seconds = 0
    reached = request.POST.get('reached_end') == '1'
    note = request.POST.get('note', '').strip()
    if step['mode'] == 'read' and (not reached or seconds < max(10, step['min_seconds'] // 3)):
        return JsonResponse({'error': 'Read the document to the end first.'}, status=400)
    if step['mode'] == 'declare' and not note:
        return JsonResponse({'error': 'Write your declaration ("none" is a valid answer).'}, status=400)
    OnboardingProgress.objects.update_or_create(
        profile=request.user, step_code=code,
        defaults=dict(seconds_spent=seconds, reached_end=reached, mode=step['mode'], note=note))
    return JsonResponse({'ok': True, 'gate_open': gate_open(request.user)})


# ---- Role-aware Workspace Dispatcher & Meetings Tab ----
TABS = ('dashboard', 'tasks', 'activities', 'meetings', 'structure', 'members')


def _descendant_ids(unit):
    ids, frontier = {unit.pk}, [unit.pk]
    while frontier:
        from core.models import OrgUnit
        frontier = list(OrgUnit.objects.filter(parent_id__in=frontier).values_list('pk', flat=True))
        frontier = [f for f in frontier if f not in ids]
        ids.update(frontier)
    return ids


@login_required
def dashboard_view(request):
    """
    Role-aware workspace home dispatcher (`app.js` `#/`):
    - Redirects to `/onboarding/` until all 10 required steps are completed.
    - HQ Founder -> `central_view`
    - HQ HOFCO -> `hofco_view`
    - Other 7 HQ roles -> `role_home_view`
    - Field Leaders / Deputies / Volunteers -> `leader_home_view`
    """
    if not gate_open(request.user):
        return redirect('onboarding:start')
    u = request.user
    if u.is_in_hq():
        from onboarding.views_hq import central_view, hofco_view, role_home_view
        fn = request.session.get('wdos_hq_fn') or u.hq_function or 'founder'
        if fn == 'founder':
            return central_view(request)
        elif fn == 'hofco':
            return hofco_view(request)
        return role_home_view(request)
    from onboarding.views_leader import leader_home_view
    return leader_home_view(request, subtab='home')


@login_required
def meetings_view(request):
    """Preserves the existing workspace meetings tab untouched."""
    if not gate_open(request.user):
        return redirect('onboarding:start')
    from core.models import OrgUnit
    from operations.models import Meeting
    u = request.user
    seat = u.roles.filter(ends_at__isnull=True).select_related('org_unit').first()
    unit = seat.org_unit if seat else u.org_unit
    is_hq = u.is_in_hq()
    units = None if is_hq else (_descendant_ids(unit) if unit else set())
    scope = Q() if units is None else Q(org_unit_id__in=units)
    kind = 'HQ' if is_hq else (seat.org_unit.level if seat else 'member')
    ctx = {
        'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr', 'tab': 'meetings',
        'tabs': TABS, 'seat': seat, 'is_hq': is_hq, 'unit': unit, 'kind': kind,
        'meetings': Meeting.objects.filter(scope | Q(organiser=u)).distinct()[:50],
    }
    return render(request, 'onboarding/workspace.html', ctx)
