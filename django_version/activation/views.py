from datetime import timedelta
from pathlib import Path
import re

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import pack
from .models import ActivationStep, CandidateActivation, ReadinessAssessment

DOCS = {'leadership-manual.html', 'code-of-conduct.html', 'volunteer-agreement.html'}


def get_or_create_activation(user, route='ref3'):
    """The activation is created from her own record if it does not exist yet (Phase 201)."""
    act = CandidateActivation.objects.filter(profile=user).first()
    if act:
        return act
    now = timezone.now()
    return CandidateActivation.objects.create(
        profile=user, route=route, network=getattr(user, 'network', '') or '',
        role=getattr(user, 'role_applied', '') or '', status='in_progress', started_at=now,
        deadline=now + timedelta(days=pack.DEADLINE_DAYS[route]))


def refresh_status(act):
    """Past the deadline without completing => Incomplete (unless an extension was approved)."""
    if act.status == 'in_progress' and act.deadline and timezone.now() > act.deadline:
        act.status = 'incomplete'
        act.save(update_fields=['status'])
    return act


def current_day(act):
    done = set(act.steps.filter(status='completed').values_list('day', flat=True))
    for d in pack.days_for(act.route):
        if d['day'] not in done:
            return d
    return None


def gate_blocks(user):
    """A candidate sees only activation, profile, help and sign-out until HQ records 'selected'."""
    act = CandidateActivation.objects.filter(profile=user).first()
    return bool(act and act.outcome != 'selected')


@login_required
def home_view(request):
    act = refresh_status(get_or_create_activation(request.user))
    days = pack.days_for(act.route)
    done = set(act.steps.filter(status='completed').values_list('day', flat=True))
    cur = current_day(act)
    assessment = getattr(act, 'assessment', None) if hasattr(act, 'assessment') else None
    last = days[-1]
    # safety net (Phase 217): the assessment day counts as done once an assessment exists
    if cur and cur['has_assessment'] and assessment and assessment.status != 'pending':
        cur = None
    step = act.steps.filter(day=cur['day']).first() if cur else None
    ctx = {
        'lang': request.session.get('wdos_lang', 'en'), 'direction': 'ltr', 'act': act, 'days': days,
        'done': done, 'cur': cur, 'step': step, 'notice': pack.NOTICE, 'total': len(days),
        'percent': round(len(done) / len(days) * 100), 'locked': act.status == 'incomplete' and act.extension_status != 'approved',
        'questions': pack.load()['questions'], 'assessment': assessment,
        'show_assessment': bool(cur and cur['has_assessment']),
        'finished': cur is None, 'answers': (step.answers if step else {}), 'acked': (step.acks if step else []),
        'msg': pack.load()['messages'],
    }
    return render(request, 'activation/home.html', ctx)


@login_required
def doc_view(request, name):
    if name not in DOCS:
        raise Http404
    html = (Path(settings.STATICFILES_DIRS[0]) / 'content' / name).read_text(encoding='utf-8')
    m = re.search(r'<body[^>]*>(.*)</body>', html, re.S | re.I)
    html = m.group(1) if m else html
    html = re.sub(r'<(script|style|iframe|object|embed)\b.*?</\1>|<link[^>]*>', '', html, flags=re.S | re.I)
    return HttpResponse(html)


def _own_open(request):
    act = refresh_status(get_or_create_activation(request.user))
    if act.status == 'incomplete' and act.extension_status != 'approved':
        return None
    return act


@login_required
@require_POST
def save_view(request, day):
    """Auto-save: every answer is kept as she types, so a dropped connection costs nothing."""
    act = _own_open(request)
    if not act:
        return JsonResponse({'error': 'Deadline passed.'}, status=403)
    cur = current_day(act)
    if not cur or cur['day'] != day:
        return JsonResponse({'error': 'This day is not open.'}, status=400)
    step, _ = ActivationStep.objects.get_or_create(activation=act, day=day)
    data = json.loads(request.body or '{}') if request.content_type == 'application/json' else request.POST
    answers = data.get('answers', {})
    step.answers = {q['key']: str(answers.get(q['key'], ''))[:5000] for q in cur['questions']}
    step.acks = [int(i) for i in data.get('acks', [])]
    step.reached_end = bool(data.get('reached_end')) or step.reached_end
    step.seconds_spent = max(step.seconds_spent, int(data.get('seconds', 0) or 0))
    step.save()
    if act.status == 'not_started':
        act.status = 'in_progress'
        act.save(update_fields=['status'])
    return JsonResponse({'ok': True})


import json  # noqa: E402


@login_required
@require_POST
def complete_view(request, day):
    act = _own_open(request)
    if not act:
        return JsonResponse({'error': 'Deadline passed.'}, status=403)
    cur = current_day(act)
    if not cur or cur['day'] != day:
        return JsonResponse({'error': 'This day is not open.'}, status=400)
    step = ActivationStep.objects.filter(activation=act, day=day).first()
    if not step:
        return JsonResponse({'error': 'Answer the questions first.'}, status=400)
    if cur['content'] and not step.reached_end:
        return JsonResponse({'error': 'Read the material to the end first.'}, status=400)
    if len(step.acks) < len(cur['acks']):
        return JsonResponse({'error': 'Tick every acknowledgement.'}, status=400)
    if any(not step.answers.get(q['key'], '').strip() for q in cur['questions']):
        return JsonResponse({'error': 'Answer every question.'}, status=400)
    step.status = 'completed'
    step.completed_at = timezone.now()
    step.save()
    if cur['has_assessment']:
        ReadinessAssessment.objects.get_or_create(activation=act)
    return JsonResponse({'ok': True})


@login_required
@require_POST
def assessment_view(request):
    """13 answers; once submitted they lock. Completing it finishes the programme."""
    act = _own_open(request)
    if not act:
        return JsonResponse({'error': 'Deadline passed.'}, status=403)
    a = getattr(act, 'assessment', None)
    if not a or a.status not in ('pending', 'returned'):
        return JsonResponse({'error': 'Assessment is not open.'}, status=400)
    data = json.loads(request.body or '{}')
    answers = {str(q['seq']): str(data.get(str(q['seq']), '')).strip() for q in pack.load()['questions']}
    if any(not v for v in answers.values()):
        return JsonResponse({'error': 'Answer all 13 questions.'}, status=400)
    if a.status == 'returned':
        a.previous = a.previous + [a.answers]
        a.version += 1
    a.answers, a.status, a.submitted_at = answers, 'submitted', timezone.now()
    a.save()
    act.status, act.completed_at = 'completed', timezone.now()
    act.save(update_fields=['status', 'completed_at'])
    return JsonResponse({'ok': True})


@login_required
@require_POST
def extension_view(request):
    act = CandidateActivation.objects.filter(profile=request.user).first()
    if not act or act.extension_status:
        return JsonResponse({'error': 'Not available.'}, status=400)
    act.extension_status = 'requested'
    act.extension_reason = request.POST.get('reason', '')[:1000]
    act.save(update_fields=['extension_status', 'extension_reason'])
    return JsonResponse({'ok': True})
