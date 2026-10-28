import re
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from .models import OnboardingProgress
from .steps import BY_CODE, STEPS


def _status(user):
    done = {p.step_code: p for p in OnboardingProgress.objects.filter(profile=user)}
    rows = [dict(s, done_at=done[s['code']].done_at if s['code'] in done else None) for s in STEPS]
    return rows


def gate_open(user):
    """The workspace gate lifts only when every required step is finished."""
    return all(r['done_at'] for r in _status(user) if r['required'])


@login_required
def start_view(request):
    rows = _status(request.user)
    current = next((r for r in rows if not r['done_at']), None)
    done = sum(1 for r in rows if r['done_at'])
    return render(request, 'onboarding/leader.html', {
        'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr',
        'steps': rows, 'current': current,
        'n': rows.index(current) + 1 if current else len(rows),
        'total': len(rows), 'done': done, 'percent': round(done / len(rows) * 100),
    })


@login_required
def doc_view(request, code):
    step = BY_CODE.get(code)
    if not step or not step['doc']:
        raise Http404
    html = (Path(settings.STATICFILES_DIRS[0]) / 'content' / step['doc']).read_text(encoding='utf-8')
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


# ---- Workspace (opens once the onboarding gate lifts) ----
from django.db.models import Q
from django.utils import timezone

TABS = ('dashboard', 'tasks', 'activities', 'meetings', 'structure', 'members')


def _descendant_ids(unit):
    ids, frontier = {unit.pk}, [unit.pk]
    while frontier:
        from core.models import OrgUnit
        frontier = list(OrgUnit.objects.filter(parent_id__in=frontier).values_list('pk', flat=True))
        frontier = [f for f in frontier if f not in ids]
        ids.update(frontier)
    return ids


def _workspace(request, tab):
    if not gate_open(request.user):
        return redirect('onboarding:start')
    from core.models import OrgUnit, Profile
    from operations.models import ActivityRecord, Meeting, Task
    u = request.user
    seat = u.roles.filter(ends_at__isnull=True).select_related('org_unit').first()
    unit = seat.org_unit if seat else u.org_unit
    is_hq = u.is_in_hq()
    # reach: HQ sees everything; a leader sees her unit and everything below it
    if is_hq:
        units = None
    elif unit:
        units = _descendant_ids(unit)
    else:
        units = set()
    scope = Q() if units is None else Q(org_unit_id__in=units)
    kind = 'HQ' if is_hq else (seat.org_unit.level if seat else 'member')
    ctx = {'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr', 'tab': tab,
           'tabs': TABS, 'seat': seat, 'is_hq': is_hq, 'unit': unit, 'kind': kind}
    mine = Q(author=u)
    if tab == 'activities':
        ctx['activities'] = ActivityRecord.objects.filter(scope | mine).distinct()[:50]
    elif tab == 'meetings':
        ctx['meetings'] = Meeting.objects.filter(scope | Q(organiser=u)).distinct()[:50]
    elif tab == 'tasks':
        ctx['tasks'] = Task.objects.filter(Q(assigned_to=u) | Q(assigned_by=u)).select_related('assigned_to')[:50]
    elif tab == 'structure':
        ctx['units'] = OrgUnit.objects.filter(pk__in=units).order_by('level', 'name')[:100] if units is not None \
            else OrgUnit.objects.order_by('level', 'name')[:100]
        ctx['seats'] = u.roles.filter(ends_at__isnull=True).select_related('org_unit')
    elif tab == 'members':
        qs = Profile.objects.exclude(pk=u.pk)
        if units is not None:
            qs = qs.filter(org_unit_id__in=units)
        ctx['members'] = qs.select_related('org_unit')[:100]
    else:
        open_tasks = Task.objects.filter(assigned_to=u).exclude(status='completed')
        ctx['tasks'] = open_tasks[:8]
        ctx['task_count'] = open_tasks.count()
        ctx['meetings'] = Meeting.objects.filter(scope, starts_at__gte=timezone.now())[:5]
        ctx['activity_count'] = ActivityRecord.objects.filter(scope | mine).distinct().count()
        mq = Profile.objects.exclude(pk=u.pk)
        oq = OrgUnit.objects.all()
        if units is not None:
            mq, oq = mq.filter(org_unit_id__in=units), oq.filter(pk__in=units)
        ctx['member_count'] = mq.count()
        ctx['unit_count'] = oq.count()
        ctx['countries'] = OrgUnit.objects.filter(level='country').count() if is_hq else None
    return render(request, 'onboarding/workspace.html', ctx)


def _make(tab):
    @login_required
    def view(request):
        return _workspace(request, tab)
    view.__name__ = f'{tab}_view'
    return view


dashboard_view, tasks_view, activities_view = _make('dashboard'), _make('tasks'), _make('activities')
meetings_view, structure_view, members_view = _make('meetings'), _make('structure'), _make('members')
