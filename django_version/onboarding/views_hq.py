import csv
import secrets
import uuid
from datetime import timedelta
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from core.models import (
    AuditLog, Department, MemberStatus, NetworkCode, OrgLevel, OrgSetting,
    OrgUnit, Profile, RoleAssignment, RoleCode, Staff, get_role_title,
)
from members.models import Application, PositionMailbox, Referral
from activation.models import ActivationStep, CandidateActivation, ReadinessAssessment
from onboarding.models import LeaderOnboardingStep
from onboarding.steps import STEPS, gate_open
from onboarding.nav import HQ_FUNCTION_LABELS, load_hq_sidebars
from operations.models import (
    ActivityRecord, Announcement, AutomationEvent, AutomationRule, CaseFile,
    Course, CourseEnrollment, EngagementFollowUp, EngagementItem,
    HelpdeskTicket, Issue, LeaderReport, Meeting, Priority, Programme,
    ProgrammeEvent, StaffMessage, StaffReport, Task, TaskStatus,
)


def _compute_leader_score(profile, onboard_done_ids):
    """Computes the 100-point Operations Centre Activity Score (ops.js)."""
    now = timezone.now()
    score = 0
    signed_in = bool(profile.last_login or profile.last_seen_at)
    seen_ref = profile.last_seen_at or profile.last_login
    if seen_ref:
        days_ago = (now - seen_ref).days
        if days_ago <= 7:
            score += 25
        elif days_ago <= 30:
            score += 12
    if profile.id in onboard_done_ids:
        score += 20
    if signed_in:
        overdue_tasks = Task.objects.filter(
            assigned_to=profile,
            status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            due_on__lt=now.date(),
        ).exists()
        if not overdue_tasks:
            score += 20
        score += 20  # Due reports baseline
        unread_hq = StaffMessage.objects.filter(recipient=profile, read_at__isnull=True).exists()
        if not unread_hq:
            score += 15
    return min(score, 100)


@login_required
def switch_hq_fn_view(request):
    if request.method == 'POST' and request.user.is_in_hq():
        fn = (request.POST.get('hq_function') or '').strip()
        if fn in HQ_FUNCTION_LABELS:
            request.session['wdos_hq_fn'] = fn
            messages.success(request, f"Switched HQ view to {HQ_FUNCTION_LABELS[fn]}.")
    return redirect('onboarding:dashboard')


@login_required
def central_view(request, view_as_target=None):
    """WDOS Central Admin / WODDI HQ Command Centre (central.js — Founder's Strategic Home)."""
    net = (request.GET.get('net') or 'all').strip()
    now = timezone.now()

    if request.method == 'POST' and request.user.is_in_hq():
        action = request.POST.get('action')
        if action == 'bulk_create_logins':
            no_login = Profile.objects.filter(last_login__isnull=True)
            count = 0
            for p in no_login[:50]:
                if not p.has_usable_password():
                    p.set_password('Woddi2026!')
                    p.save()
                    count += 1
            messages.success(request, f"Provisioned temporary credentials for {count} directory accounts.")
            return redirect('onboarding:central')
        elif action == 'seat_from_lists':
            unseated = Profile.objects.filter(is_leader=True, roles__isnull=True, org_unit__isnull=False)
            seated = 0
            for p in unseated:
                RoleAssignment.objects.create(
                    profile=p,
                    role=p.role_applied or RoleCode.CHAPTER_LEAD,
                    org_unit=p.org_unit,
                    assigned_by=request.user,
                    appointment_status='appointed',
                )
                seated += 1
            messages.success(request, f"Seated {seated} leaders from master directory lists.")
            return redirect('onboarding:central')

    profiles_qs = Profile.objects.all()
    roles_qs = RoleAssignment.objects.filter(ends_at__isnull=True).select_related('profile', 'org_unit')
    apps_qs = Application.objects.all()
    acts_qs = CandidateActivation.objects.all()
    if net in ('WGMN', 'WNNN'):
        profiles_qs = profiles_qs.filter(network=net)
        roles_qs = roles_qs.filter(profile__network=net)
        apps_qs = apps_qs.filter(network=net)
        acts_qs = acts_qs.filter(network=net)

    countries_qs = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True)
    countries_represented = countries_qs.count()
    countries_not_represented = max(0, 54 - countries_represented)

    country_rows = []
    need_strengthening = 0
    vacant_country_seats = 0
    for c in countries_qs:
        c_roles = roles_qs.filter(org_unit=c)
        cr = c_roles.filter(role=RoleCode.COUNTRY_REP).first()
        dcr = c_roles.filter(role=RoleCode.DEPUTY_COUNTRY_REP).first()
        sub_ids = c.subtree_ids()
        states_total = OrgUnit.objects.filter(parent=c, level=OrgLevel.STATE_REGION).count()
        states_covered = RoleAssignment.objects.filter(
            org_unit__parent=c, org_unit__level=OrgLevel.STATE_REGION, ends_at__isnull=True
        ).values('org_unit').distinct().count()
        cov_pct = int(round((states_covered / states_total) * 100)) if states_total else 100
        active_leaders = RoleAssignment.objects.filter(org_unit_id__in=sub_ids, ends_at__isnull=True).count()
        if not cr:
            vacant_country_seats += 1
            need_strengthening += 1
            health = 'Attention Required'
        elif cov_pct < 50:
            need_strengthening += 1
            health = 'Needs Strengthening'
        else:
            health = 'On Track'
        country_rows.append({
            'unit': c,
            'cr': cr.profile if cr else None,
            'dcr': dcr.profile if dcr else None,
            'states_total': states_total,
            'states_covered': states_covered,
            'coverage_pct': cov_pct,
            'active_leaders': active_leaders,
            'compliance_pct': 85 if cr else 40,
            'health': health,
        })

    states_all = OrgUnit.objects.filter(level=OrgLevel.STATE_REGION, is_active=True).count()
    states_with_sc = RoleAssignment.objects.filter(
        org_unit__level=OrgLevel.STATE_REGION, ends_at__isnull=True
    ).values('org_unit').distinct().count()
    vacant_state_seats = max(0, states_all - states_with_sc)

    leaders_seated = roles_qs.values('profile').distinct().count()
    active_30d = profiles_qs.filter(
        Q(last_seen_at__gte=now - timedelta(days=30)) | Q(last_login__gte=now - timedelta(days=30))
    ).count()

    reports_due = LeaderReport.objects.filter(status__in=['draft', 'returned', 'submitted']).count()
    approval_requests = (
        apps_qs.filter(status__in=['submitted', 'under_review', 'recommended']).count()
        + acts_qs.filter(status='completed', outcome='').count()
    )
    programmes_running = Programme.objects.filter(is_active=True).count()

    # Immediate Attention 8 counters
    attention = [
        {'label': 'Vacant Country Rep Seats', 'count': vacant_country_seats, 'url': '/workspace/structure/?level=country&status=vacant', 'tone': 'red'},
        {'label': 'Inactive Leaders (14d+)', 'count': profiles_qs.filter(is_leader=True, last_seen_at__isnull=True).count(), 'url': '/workspace/ops/leaders/?filter=never', 'tone': 'amber'},
        {'label': 'Pending Applications', 'count': apps_qs.filter(status__in=['submitted', 'under_review']).count(), 'url': '/workspace/recruitment/', 'tone': 'amber'},
        {'label': 'Assessments Awaiting Review', 'count': ReadinessAssessment.objects.filter(status='submitted').count(), 'url': '/workspace/hq-activation/', 'tone': 'red'},
        {'label': 'Open Safeguarding Cases', 'count': CaseFile.objects.exclude(status__in=['resolved', 'dismissed']).count(), 'url': '/workspace/cases/', 'tone': 'red'},
        {'label': 'Overdue Tasks', 'count': Task.objects.filter(status__in=['pending', 'in_progress'], due_on__lt=now.date()).count(), 'url': '/workspace/tasks/?scope=overdue', 'tone': 'amber'},
        {'label': 'Pending Seat Acceptances', 'count': roles_qs.filter(accepted_at__isnull=True, declined_at__isnull=True).count(), 'url': '/workspace/accounts/?f=pending', 'tone': 'amber'},
        {'label': 'Open Helpdesk Tickets', 'count': HelpdeskTicket.objects.exclude(status__in=['resolved', 'closed']).count(), 'url': '/workspace/helpdesk/', 'tone': 'blue'},
    ]

    # Dual Recruitment Funnels
    funnel_open7 = {
        'received': apps_qs.count(),
        'activation7': acts_qs.filter(route='open7').count(),
        'review': acts_qs.filter(route='open7', status='completed').count(),
        'selected': acts_qs.filter(route='open7', outcome='selected').count(),
    }
    funnel_ref3 = {
        'referrals': Referral.objects.count(),
        'started': acts_qs.filter(route='ref3').count(),
        'completed': acts_qs.filter(route='ref3', status='completed').count(),
        'selected': acts_qs.filter(route='ref3', outcome='selected').count(),
    }

    # Leadership Ladder
    ladder = [
        {'level': 'Country Leadership (CR / DCR)', 'filled': roles_qs.filter(org_unit__level=OrgLevel.COUNTRY).count(), 'total': countries_represented * 2},
        {'level': 'State / Regional Coordinators', 'filled': roles_qs.filter(org_unit__level=OrgLevel.STATE_REGION).count(), 'total': max(states_all * 2, 1)},
        {'level': 'LGA / District Coordinators', 'filled': roles_qs.filter(org_unit__level=OrgLevel.DISTRICT_LGA).count(), 'total': max(OrgUnit.objects.filter(level=OrgLevel.DISTRICT_LGA).count() * 2, 10)},
        {'level': 'Community Cluster Leaders', 'filled': roles_qs.filter(org_unit__level=OrgLevel.COMMUNITY_CLUSTER).count(), 'total': max(OrgUnit.objects.filter(level=OrgLevel.COMMUNITY_CLUSTER).count() * 2, 10)},
        {'level': 'Chapter Coordinators / Leads', 'filled': roles_qs.filter(org_unit__level=OrgLevel.CHAPTER).count(), 'total': max(OrgUnit.objects.filter(level=OrgLevel.CHAPTER).count() * 2, 20)},
    ]

    return render(request, 'onboarding/hq/central.html', {
        'tab': 'dashboard',
        'page_title': 'Founder & Executive Command Centre',
        'net': net,
        'view_as_target': view_as_target,
        'kpis': {
            'countries_represented': countries_represented,
            'need_strengthening': need_strengthening,
            'not_represented': countries_not_represented,
            'leaders_seated': leaders_seated,
            'active_30d': active_30d,
            'vacant_country': vacant_country_seats,
            'vacant_state': vacant_state_seats,
            'reports_due': reports_due,
            'approval_requests': approval_requests,
            'programmes_running': programmes_running,
        },
        'attention': attention,
        'funnel_open7': funnel_open7,
        'funnel_ref3': funnel_ref3,
        'ladder': ladder,
        'country_rows': country_rows,
    })


@login_required
def hofco_view(request, view_as_target=None):
    """Reference Screen 1 — Head of Field & Country Operations Dashboard (hofco.js)."""
    period = (request.GET.get('period') or 'month').strip()
    net = (request.GET.get('net') or 'all').strip()
    now = timezone.now()

    countries_qs = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True)
    roles_qs = RoleAssignment.objects.filter(ends_at__isnull=True).select_related('profile', 'org_unit')
    if net in ('WGMN', 'WNNN'):
        roles_qs = roles_qs.filter(profile__network=net)

    total_units = OrgUnit.objects.exclude(level=OrgLevel.HEADQUARTERS).count() or 1
    covered_units = roles_qs.values('org_unit').distinct().count()
    coverage_pct = min(100, int(round((covered_units / total_units) * 100)))

    wgmn_stats = {
        'leaders': RoleAssignment.objects.filter(ends_at__isnull=True, profile__network='WGMN').count(),
        'members': Profile.objects.filter(network='WGMN').count(),
        'activations': CandidateActivation.objects.filter(network='WGMN').count(),
    }
    wnnn_stats = {
        'leaders': RoleAssignment.objects.filter(ends_at__isnull=True, profile__network='WNNN').count(),
        'members': Profile.objects.filter(network='WNNN').count(),
        'activations': CandidateActivation.objects.filter(network='WNNN').count(),
    }

    country_rows = []
    for c in countries_qs:
        sub_ids = c.subtree_ids()
        cr = RoleAssignment.objects.filter(org_unit=c, role=RoleCode.COUNTRY_REP, ends_at__isnull=True).select_related('profile').first()
        leaders_cnt = RoleAssignment.objects.filter(org_unit_id__in=sub_ids, ends_at__isnull=True).count()
        reports_cnt = LeaderReport.objects.filter(org_unit_id__in=sub_ids).count()
        events_cnt = ProgrammeEvent.objects.filter(org_unit_id__in=sub_ids).count()
        country_rows.append({
            'unit': c,
            'cr': cr.profile if cr else None,
            'leaders_cnt': leaders_cnt,
            'reports_cnt': reports_cnt,
            'events_cnt': events_cnt,
            'status': 'On Track' if cr else 'Vacancy',
        })

    attention_items = [
        {'issue': 'Country Representative Vacancy', 'network': 'WGMN', 'country': c['unit'].name, 'level': 'Country', 'priority': 'High', 'url': f"/workspace/country/{c['unit'].id}/"}
        for c in country_rows if not c['cr']
    ][:6]

    return render(request, 'onboarding/hq/hofco.html', {
        'tab': 'dashboard',
        'page_title': 'HOFCO Field & Country Operations Dashboard',
        'period': period,
        'net': net,
        'view_as_target': view_as_target,
        'kpis': {
            'countries_op': countries_qs.count(),
            'coverage_pct': coverage_pct,
            'active_leaders': roles_qs.count(),
            'priority_vacancies': max(0, countries_qs.count() - roles_qs.filter(role=RoleCode.COUNTRY_REP).count()),
            'reports_outstanding': LeaderReport.objects.filter(status__in=['draft', 'returned']).count(),
            'activities_period': ActivityRecord.objects.count() + ProgrammeEvent.objects.count(),
        },
        'wgmn_stats': wgmn_stats,
        'wnnn_stats': wnnn_stats,
        'country_rows': country_rows,
        'attention_items': attention_items,
    })


@login_required
def role_home_view(request, view_as_target=None):
    """Common HQ Role Homepage for the other 7 HQ functions (rolehome.js)."""
    fn = request.GET.get('fn') or request.session.get('wdos_hq_fn') or request.user.hq_function or 'secretary'
    fn_label = HQ_FUNCTION_LABELS.get(fn, 'HQ Department Dashboard')

    spec_map = {
        'secretary': {
            'focus': 'Leadership registers, activation tracking, meeting minutes, reporting compliance, and action follow-up.',
            'quick': [
                ('Leadership Register', '/workspace/structure/'),
                ('HQ Activation & Readiness', '/workspace/hq-activation/'),
                ('Reporting Compliance', '/workspace/reporting/compliance/'),
                ('Meetings & Minutes', '/workspace/meetings/'),
            ],
        },
        'admin': {
            'focus': 'Cross-departmental coordination, accounts & seat administration, position mailboxes, and document control.',
            'quick': [
                ('Accounts & Seats', '/workspace/accounts/'),
                ('Position Mailboxes', '/workspace/mailboxes/'),
                ('HQ Tasks', '/workspace/tasks/?scope=hq'),
                ('Template Library', '/workspace/library/'),
            ],
        },
        'programmes': {
            'focus': 'Programme portfolio (WIWS, WGMN, WNNN), country events, beneficiary registers, and field impact verification.',
            'quick': [
                ('Programmes & Events', '/workspace/programmes/'),
                ('Field Activity Records', '/workspace/reporting/records/'),
                ('Report Reviews', '/workspace/reporting/review/'),
                ('Impact Analytics', '/workspace/reports/'),
            ],
        },
        'comms': {
            'focus': 'Broadcast announcements, spotlight nominations review, message templates, and network visibility.',
            'quick': [
                ('Announcements', '/workspace/announcements/'),
                ('Spotlight Review', '/workspace/spotlight-review/'),
                ('Message Library', '/workspace/library/'),
                ('Content Studio', '/workspace/content/'),
            ],
        },
        'finance': {
            'focus': 'Budget allocations, programme resource tracking, financial controls, and audit documentation.',
            'planned': True,
            'quick': [
                ('Finance Architecture', '/workspace/planned/finance/'),
                ('Programmes Portfolio', '/workspace/programmes/'),
                ('Template Library', '/workspace/library/'),
                ('Executive Archive', '/workspace/reporting/archive/'),
            ],
        },
        'it': {
            'focus': 'WDOS system health, user accounts & access matrix, position mailboxes, and technical support queue.',
            'quick': [
                ('WDOS Doctor', '/workspace/doctor/'),
                ('System Settings & Access', '/workspace/settings/'),
                ('Accounts & Logins', '/workspace/accounts/'),
                ('Helpdesk Queue', '/workspace/helpdesk/'),
            ],
        },
        'qa': {
            'focus': 'Quality assurance, candidate readiness controls, UAT feedback register, and audit logs.',
            'quick': [
                ('HQ Activation & Readiness', '/workspace/hq-activation/'),
                ('UAT Feedback Register', '/workspace/feedback/'),
                ('WDOS Doctor & Audit', '/workspace/doctor/'),
                ('System Adoption', '/workspace/accounts/?f=never'),
            ],
        },
    }
    spec = spec_map.get(fn, spec_map['secretary'])

    return render(request, 'onboarding/hq/rolehome.html', {
        'tab': 'dashboard',
        'page_title': fn_label,
        'fn': fn,
        'fn_label': fn_label,
        'spec': spec,
        'view_as_target': view_as_target,
        'stats': {
            'open_tasks': Task.objects.exclude(status=TaskStatus.COMPLETED).count(),
            'pending_apps': Application.objects.filter(status='submitted').count(),
            'open_tickets': HelpdeskTicket.objects.exclude(status__in=['resolved', 'closed']).count(),
            'active_leaders': RoleAssignment.objects.filter(ends_at__isnull=True).count(),
            'programmes': Programme.objects.filter(is_active=True).count(),
            'reports_review': LeaderReport.objects.filter(status='submitted').count(),
        },
    })


@login_required
def network_hq_view(request, net='WGMN'):
    """Single-Network Command Page (networkhq.js — #/network/WGMN and #/network/WNNN)."""
    net = 'WNNN' if str(net).upper() == 'WNNN' else 'WGMN'
    profiles = Profile.objects.filter(network=net)
    roles = RoleAssignment.objects.filter(ends_at__isnull=True, profile__network=net).select_related('profile', 'org_unit')
    acts = CandidateActivation.objects.filter(network=net)
    apps = Application.objects.filter(network=net)
    countries = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True)

    return render(request, 'onboarding/hq/network_hq.html', {
        'tab': 'dashboard',
        'page_title': f'{net} Network Command',
        'net': net,
        'motto': 'Nurture NextGen Network (18–29)' if net == 'WNNN' else 'Good Mother Network (30+)',
        'kpis': {
            'countries': countries.count(),
            'leaders': roles.count(),
            'members': profiles.count(),
            'activations_ref3': acts.filter(route='ref3').count(),
            'activations_open7': acts.filter(route='open7').count(),
            'applications': apps.count(),
        },
        'roles': roles[:30],
        'countries': countries,
    })


@login_required
def command_view(request):
    """WDOS Network Command — The Founder's Monday Standard (command.js — #/command)."""
    net = (request.GET.get('net') or 'all').strip()
    drill = (request.GET.get('drill') or '').strip()
    now = timezone.now()

    profiles = Profile.objects.all()
    roles = RoleAssignment.objects.filter(ends_at__isnull=True).select_related('profile', 'org_unit')
    apps = Application.objects.all()
    tasks = Task.objects.all()
    acts = CandidateActivation.objects.all()
    if net in ('WGMN', 'WNNN'):
        profiles = profiles.filter(network=net)
        roles = roles.filter(profile__network=net)
        apps = apps.filter(network=net)
        acts = acts.filter(network=net)

    done_pack_ids = set(
        LeaderOnboardingStep.objects.filter(step_code='pack').values_list('profile_id', flat=True)
    )

    kpi_cards = [
        ('total_people', 'Total People', profiles.count()),
        ('seated_leaders', 'Seated Leaders', roles.values('profile').distinct().count()),
        ('active_7d', 'Active Leaders (7d)', profiles.filter(is_leader=True, last_login__gte=now - timedelta(days=7)).count()),
        ('never_signed_in', 'Never Signed In', profiles.filter(last_login__isnull=True).count()),
        ('onboarding_complete', 'Onboarding Complete', len(done_pack_ids)),
        ('pending_acceptance', 'Pending Acceptance', roles.filter(accepted_at__isnull=True, declined_at__isnull=True).count()),
        ('countries_active', 'Countries Active', OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True).count()),
        ('open_applications', 'Open Applications', apps.filter(status__in=['submitted', 'under_review']).count()),
        ('in_activation', 'In Activation (3d/7d)', acts.filter(status='in_progress').count()),
        ('tasks_open', 'Tasks Open', tasks.exclude(status=TaskStatus.COMPLETED).count()),
        ('tasks_overdue', 'Tasks Overdue', tasks.filter(status__in=['pending', 'in_progress'], due_on__lt=now.date()).count()),
        ('announcements_30d', 'Announcements (30d)', Announcement.objects.filter(created_at__gte=now - timedelta(days=30)).count()),
        ('safeguarding_open', 'Safeguarding Open', CaseFile.objects.exclude(status__in=['resolved', 'dismissed']).count()),
    ]

    drill_rows = []
    drill_title = ''
    if drill == 'seated_leaders':
        drill_title = 'Seated Leaders'
        drill_rows = [{'name': r.profile.full_name, 'sub': f"{r.get_role_display()} · {r.org_unit.name}", 'url': f"/workspace/members/{r.profile.id}/"} for r in roles[:50]]
    elif drill == 'never_signed_in':
        drill_title = 'Accounts Never Signed In'
        drill_rows = [{'name': p.full_name, 'sub': f"{p.email} · {p.network}", 'url': f"/workspace/members/{p.id}/"} for p in profiles.filter(last_login__isnull=True)[:50]]
    elif drill == 'open_applications':
        drill_title = 'Open Applications'
        drill_rows = [{'name': a.full_name, 'sub': f"{a.email} · {a.network} · {a.org_unit.name}", 'url': f"/workspace/recruitment/{a.id}/"} for a in apps.filter(status__in=['submitted', 'under_review'])[:50]]
    elif drill == 'tasks_overdue':
        drill_title = 'Overdue Tasks'
        drill_rows = [{'name': t.title, 'sub': f"Assigned to {t.assigned_to.full_name} · Due {t.due_on}", 'url': f"/workspace/tasks/{t.id}/"} for t in tasks.filter(status__in=['pending', 'in_progress'], due_on__lt=now.date())[:50]]
    elif drill:
        drill_title = 'People Register'
        drill_rows = [{'name': p.full_name, 'sub': f"{p.email} · {p.get_status_display()}", 'url': f"/workspace/members/{p.id}/"} for p in profiles[:50]]

    by_level = [
        ('Country', roles.filter(org_unit__level=OrgLevel.COUNTRY).count()),
        ('State / Region', roles.filter(org_unit__level=OrgLevel.STATE_REGION).count()),
        ('LGA / District', roles.filter(org_unit__level=OrgLevel.DISTRICT_LGA).count()),
        ('Community Cluster', roles.filter(org_unit__level=OrgLevel.COMMUNITY_CLUSTER).count()),
        ('Chapter', roles.filter(org_unit__level=OrgLevel.CHAPTER).count()),
    ]

    return render(request, 'onboarding/hq/command.html', {
        'tab': 'dashboard',
        'page_title': 'WDOS Network Command',
        'net': net,
        'kpi_cards': kpi_cards,
        'drill': drill,
        'drill_title': drill_title,
        'drill_rows': drill_rows,
        'by_level': by_level,
    })


@login_required
def ops_view(request, subtab='overview'):
    """HQ Operations Centre (ops.js & opsreport.js — overview, leaders, activity, messages, tasks, reports, autopilot)."""
    subtab = (subtab or request.GET.get('subtab') or 'overview').strip().lower()
    net = (request.GET.get('net') or 'all').strip()
    now = timezone.now()

    onboard_done_ids = set(
        LeaderOnboardingStep.objects.filter(step_code='pack').values_list('profile_id', flat=True)
    )

    leaders_qs = Profile.objects.filter(Q(is_leader=True) | Q(roles__isnull=False)).distinct().select_related('org_unit')
    if net in ('WGMN', 'WNNN'):
        leaders_qs = leaders_qs.filter(network=net)

    q = (request.GET.get('q') or '').strip()
    if q:
        leaders_qs = leaders_qs.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q) | Q(country__icontains=q)
        )

    leader_rows = []
    for p in leaders_qs:
        sc = _compute_leader_score(p, onboard_done_ids)
        seat = p.get_roles().first()
        leader_rows.append({
            'profile': p,
            'seat': seat,
            'score': sc,
            'onboarded': p.id in onboard_done_ids,
            'accepted': bool(seat and seat.accepted_at),
        })

    if request.GET.get('export') == 'csv':
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="wdos-operations-leaders.csv"'
        writer = csv.writer(resp)
        writer.writerow(['Full Name', 'Email', 'Network', 'Country', 'Unit', 'Role', 'Activity Score', 'Onboarding Done', 'Last Login'])
        for r in leader_rows:
            p = r['profile']
            s = r['seat']
            writer.writerow([
                p.full_name, p.email, p.network, p.country,
                s.org_unit.name if s else (p.org_unit.name if p.org_unit else ''),
                s.get_role_display() if s else '',
                r['score'], 'Yes' if r['onboarded'] else 'No',
                p.last_login.strftime('%Y-%m-%d %H:%M') if p.last_login else 'Never',
            ])
        return resp

    if request.method == 'POST' and request.user.is_in_hq():
        action = request.POST.get('action')
        if action == 'ops_send_message':
            subject = (request.POST.get('subject') or 'HQ Directive').strip()
            body = (request.POST.get('body') or '').strip()
            target_net = request.POST.get('target_net') or 'all'
            if body:
                batch_id = f"MSG-{uuid.uuid4().hex[:8].upper()}"
                recips = Profile.objects.filter(is_leader=True)
                if target_net in ('WGMN', 'WNNN'):
                    recips = recips.filter(network=target_net)
                cnt = 0
                for r in recips:
                    StaffMessage.objects.create(
                        sender=request.user,
                        recipient=r,
                        subject=subject,
                        body=body,
                        batch_id=batch_id,
                    )
                    cnt += 1
                messages.success(request, f"Sent HQ message batch {batch_id} to {cnt} leaders.")
            return redirect('onboarding:ops_tab', subtab='messages')

        elif action == 'ops_assign_task':
            title = (request.POST.get('title') or '').strip()
            details = (request.POST.get('details') or '').strip()
            priority = request.POST.get('priority') or Priority.HIGH
            due_on = request.POST.get('due_on') or None
            target_net = request.POST.get('target_net') or 'all'
            if title:
                batch_id = f"TSK-{uuid.uuid4().hex[:8].upper()}"
                recips = Profile.objects.filter(is_leader=True)
                if target_net in ('WGMN', 'WNNN'):
                    recips = recips.filter(network=target_net)
                hq_unit = OrgUnit.objects.filter(level=OrgLevel.HEADQUARTERS).first() or OrgUnit.objects.first()
                cnt = 0
                for r in recips:
                    Task.objects.create(
                        title=title,
                        details=details,
                        org_unit=r.org_unit or hq_unit,
                        assigned_to=r,
                        assigned_by=request.user,
                        priority=priority,
                        due_on=due_on,
                        batch_id=batch_id,
                        batch_label=f"{title} ({target_net})",
                    )
                    cnt += 1
                messages.success(request, f"Assigned task batch {batch_id} to {cnt} leaders.")
            return redirect('onboarding:ops_tab', subtab='tasks')

        elif action == 'toggle_autopilot':
            code = request.POST.get('rule_code')
            rule = AutomationRule.objects.filter(code=code).first()
            if rule:
                rule.is_active = not rule.is_active
                days = request.POST.get('threshold_days')
                if days and days.isdigit():
                    rule.threshold_days = int(days)
                rule.save()
                messages.success(request, f"Updated autopilot rule '{rule.name}' ({'ON' if rule.is_active else 'OFF'}).")
            return redirect('onboarding:ops_tab', subtab='autopilot')

        elif action == 'run_autopilot':
            active_rules = AutomationRule.objects.filter(is_autopilot=True, is_active=True)
            fired = 0
            for rule in active_rules:
                rule.last_run_at = now
                rule.save(update_fields=['last_run_at'])
                AutomationEvent.objects.create(
                    rule=rule,
                    target_member=request.user,
                    summary=f"Executed {rule.name} (threshold: {rule.threshold_days}d).",
                )
                fired += 1
            messages.success(request, f"Ran {fired} active autopilot rules.")
            return redirect('onboarding:ops_tab', subtab='autopilot')

    avg_score = int(round(sum(r['score'] for r in leader_rows) / len(leader_rows))) if leader_rows else 0
    selected_leader = None
    leader_id = request.GET.get('leader')
    if leader_id:
        selected_leader = Profile.objects.filter(pk=leader_id).first()

    autopilot_rules = AutomationRule.objects.filter(is_autopilot=True)
    autopilot_events = AutomationEvent.objects.select_related('rule', 'target_member')[:30]
    audit_feed = AuditLog.objects.select_related('actor')[:40]
    sent_messages = StaffMessage.objects.exclude(batch_id='')[:30]
    task_batches = Task.objects.exclude(batch_id='')[:30]

    return render(request, 'onboarding/hq/ops.html', {
        'tab': 'dashboard',
        'page_title': 'HQ Operations Centre',
        'subtab': subtab,
        'net': net,
        'q': q,
        'leader_rows': leader_rows,
        'selected_leader': selected_leader,
        'avg_score': avg_score,
        'kpis': {
            'leaders': len(leader_rows),
            'active7': sum(1 for r in leader_rows if r['profile'].last_login and (now - r['profile'].last_login).days <= 7),
            'never': sum(1 for r in leader_rows if not r['profile'].last_login),
            'onboarding_pending': sum(1 for r in leader_rows if not r['onboarded']),
            'avg_score': avg_score,
            'tasks_overdue': Task.objects.filter(status__in=['pending', 'in_progress'], due_on__lt=now.date()).count(),
            'reports_overdue': LeaderReport.objects.filter(status__in=['draft', 'returned']).count(),
            'not_accepted': sum(1 for r in leader_rows if not r['accepted']),
        },
        'autopilot_rules': autopilot_rules,
        'autopilot_events': autopilot_events,
        'audit_feed': audit_feed,
        'sent_messages': sent_messages,
        'task_batches': task_batches,
    })


@login_required
def hq_activation_view(request):
    """HQ Activation & Readiness Command (hqactivation.js — 3-Day ref3, 7-Day open7, 14-Day d14, scoring, seat ranking & appointment)."""
    route = (request.GET.get('route') or 'ref3').strip()
    net_filter = (request.GET.get('net') or '').strip()
    stage_filter = (request.GET.get('stage') or '').strip()
    q = (request.GET.get('q') or '').strip()

    if request.method == 'POST' and request.user.is_in_hq():
        action = request.POST.get('action')
        if action == 'toggle_ref_form':
            code = (request.POST.get('code') or '').strip().upper()
            ref, _ = Referral.objects.get_or_create(
                referral_code=code,
                defaults={'referrer': request.user, 'network': code if code in ('WGMN', 'WNNN') else 'WGMN', 'route': 'ref3'}
            )
            ref.is_active = not ref.is_active
            ref.save(update_fields=['is_active'])
            messages.success(request, f"{code} Referral Form is now {'ACTIVE' if ref.is_active else 'PAUSED'}.")
            return redirect('onboarding:hq_activation')

        elif action == 'review_candidate':
            act_id = request.POST.get('activation_id')
            act = get_object_or_404(CandidateActivation, pk=act_id)
            outcome = (request.POST.get('outcome') or '').strip()
            reviewer_notes = (request.POST.get('reviewer_notes') or '').strip()
            return_note = (request.POST.get('return_note') or '').strip()
            short_score = int(request.POST.get('short_score') or 6)

            ra, _ = ReadinessAssessment.objects.get_or_create(activation=act)
            ra.scores = {'short_total': short_score, 'reviewer_notes': reviewer_notes}
            if outcome == 'returned':
                ra.status = 'returned'
                ra.return_note = return_note or reviewer_notes
                ra.save()
                messages.warning(request, f"Returned {act.profile.full_name}'s assessment for correction.")
            else:
                ra.status = 'completed'
                ra.save()
                act.outcome = outcome
                act.status = 'completed'
                act.save(update_fields=['outcome', 'status'])
                messages.success(request, f"Recorded outcome '{outcome}' for {act.profile.full_name}.")
            return redirect('onboarding:hq_activation')

        elif action == 'appoint_candidate':
            act_id = request.POST.get('activation_id')
            act = get_object_or_404(CandidateActivation, pk=act_id)
            reason = (request.POST.get('reason') or 'Approved after activation & readiness review').strip()
            unit = act.org_unit or act.profile.org_unit or OrgUnit.objects.filter(level=OrgLevel.COUNTRY).first()
            role = act.role_considered if act.role_considered in dict(RoleCode.choices) else RoleCode.STATE_COORDINATOR

            act.outcome = 'selected'
            act.status = 'completed'
            act.save(update_fields=['outcome', 'status'])

            act.profile.is_leader = True
            act.profile.status = MemberStatus.ACTIVATED
            act.profile.org_unit = unit
            act.profile.save(update_fields=['is_leader', 'status', 'org_unit'])

            RoleAssignment.objects.get_or_create(
                profile=act.profile,
                role=role,
                org_unit=unit,
                defaults={'assigned_by': request.user, 'appointment_status': 'appointed', 'reason': reason}
            )
            # Move other competing candidates for the same seat to reserve
            CandidateActivation.objects.filter(
                profile__org_unit=unit, role=act.role, status='completed'
            ).exclude(pk=act.pk).update(outcome='reserve')

            messages.success(request, f"Appointed {act.profile.full_name} as {get_role_title(role, act.network)} at {unit.name}!")
            return redirect('onboarding:hq_activation')

        elif action == 'decide_extension':
            act_id = request.POST.get('activation_id')
            act = get_object_or_404(CandidateActivation, pk=act_id)
            days = int(request.POST.get('days') or 3)
            act.deadline = timezone.now() + timedelta(days=days)
            act.extension_status = 'approved'
            act.status = 'in_progress'
            act.save(update_fields=['deadline', 'extension_status', 'status'])
            messages.success(request, f"Granted {days}-day extension to {act.profile.full_name}.")
            return redirect('onboarding:hq_activation')

    acts_qs = CandidateActivation.objects.select_related('profile', 'profile__org_unit').order_by('-created_at')
    if route in ('ref3', 'open7'):
        acts_qs = acts_qs.filter(route=route)
    if net_filter in ('WGMN', 'WNNN'):
        acts_qs = acts_qs.filter(network=net_filter)
    if stage_filter:
        if stage_filter == 'selected':
            acts_qs = acts_qs.filter(outcome='selected')
        else:
            acts_qs = acts_qs.filter(status=stage_filter)
    if q:
        acts_qs = acts_qs.filter(
            Q(profile__first_name__icontains=q) | Q(profile__last_name__icontains=q) | Q(profile__email__icontains=q) | Q(referral_code__icontains=q)
        )

    if request.GET.get('export') == 'csv':
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = f'attachment; filename="wdos-activation-{route}.csv"'
        writer = csv.writer(resp)
        writer.writerow(['Full Name', 'Email', 'Phone', 'Network', 'Route', 'Position Considered', 'Unit', 'Referrer', 'Day', 'Status', 'Outcome'])
        for a in acts_qs:
            writer.writerow([
                a.profile.full_name, a.profile.email, a.profile.phone or '',
                a.network, a.route, a.role_considered,
                a.org_unit.name if a.org_unit else '', a.referrer_name,
                a.current_day, a.status, a.outcome,
            ])
        return resp

    wgmn_form, _ = Referral.objects.get_or_create(referral_code='WGMN', defaults={'network': 'WGMN', 'route': 'ref3'})
    wnnn_form, _ = Referral.objects.get_or_create(referral_code='WNNN', defaults={'network': 'WNNN', 'route': 'ref3'})

    total_reg = acts_qs.count()
    completed_cnt = acts_qs.filter(status='completed').count()
    selected_cnt = acts_qs.filter(outcome='selected').count()
    reserve_cnt = acts_qs.filter(outcome='reserve').count()

    return render(request, 'onboarding/hq/hq_activation.html', {
        'tab': 'dashboard',
        'page_title': 'HQ Activation & Readiness Command',
        'route': route,
        'net_filter': net_filter,
        'stage_filter': stage_filter,
        'q': q,
        'wgmn_form': wgmn_form,
        'wnnn_form': wnnn_form,
        'activations': acts_qs[:100],
        'kpis': {
            'registered': total_reg,
            'in_progress': acts_qs.filter(status='in_progress').count(),
            'completed': completed_cnt,
            'selected': selected_cnt,
            'reserve': reserve_cnt,
            'extensions': acts_qs.filter(extension_status='requested').count(),
        },
    })


@login_required
def mailboxes_view(request):
    """HQ Position Mailboxes Register & Gate Control (hqmailboxes.js — #/hq/mailboxes)."""
    gate_setting, _ = OrgSetting.objects.get_or_create(
        key='mailbox_gate', defaults={'value': {'mode': 'activation_or_onboarding'}}
    )
    gate_mode = gate_setting.value.get('mode', 'activation_or_onboarding')

    if request.method == 'POST' and request.user.is_in_hq():
        action = request.POST.get('action')
        if action == 'set_gate':
            new_mode = request.POST.get('gate_mode') or 'activation_or_onboarding'
            gate_setting.value = {'mode': new_mode}
            gate_setting.save()
            messages.success(request, f"Updated Position Mailbox credential gate to '{new_mode}'.")
            return redirect('onboarding:mailboxes')
        elif action == 'create_mailbox':
            pos_code = (request.POST.get('position_code') or '').strip().upper()
            email_addr = (request.POST.get('email_address') or '').strip().lower()
            display_name = (request.POST.get('display_name') or '').strip()
            unit_id = request.POST.get('org_unit_id')
            holder_id = request.POST.get('holder_id')
            role = request.POST.get('role') or RoleCode.COUNTRY_REP
            if pos_code and email_addr and display_name:
                unit = OrgUnit.objects.filter(pk=unit_id).first() if unit_id else None
                holder = Profile.objects.filter(pk=holder_id).first() if holder_id else None
                PositionMailbox.objects.update_or_create(
                    position_code=pos_code,
                    defaults={
                        'email_address': email_addr,
                        'display_name': display_name,
                        'org_unit': unit,
                        'holder': holder,
                        'role': role,
                        'country_iso': unit.country_iso if unit else 'NG',
                        'is_unlocked': True,
                    }
                )
                messages.success(request, f"Saved position mailbox {email_addr}.")
            return redirect('onboarding:mailboxes')

    q = (request.GET.get('q') or '').strip()
    mboxes = PositionMailbox.objects.select_related('org_unit', 'holder').all()
    if q:
        mboxes = mboxes.filter(
            Q(position_code__icontains=q) | Q(email_address__icontains=q) | Q(display_name__icontains=q)
        )

    if request.GET.get('export') == 'csv':
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="wdos-position-mailboxes.csv"'
        writer = csv.writer(resp)
        writer.writerow(['Position Code', 'Email Address', 'Display Name', 'Unit', 'Holder', 'Unlocked', 'Reveals'])
        for m in mboxes:
            writer.writerow([
                m.position_code, m.email_address, m.display_name,
                m.org_unit.name if m.org_unit else '',
                m.holder.full_name if m.holder else 'Vacant',
                'Yes' if m.is_unlocked else 'Locked',
                m.reveal_count,
            ])
        return resp

    units = OrgUnit.objects.filter(is_active=True).order_by('name')
    leaders = Profile.objects.filter(is_leader=True).order_by('first_name')

    return render(request, 'onboarding/hq/mailboxes.html', {
        'tab': 'dashboard',
        'page_title': 'Position Mailboxes & Credential Gate',
        'gate_mode': gate_mode,
        'mailboxes': mboxes,
        'q': q,
        'units': units,
        'leaders': leaders,
        'roles': RoleCode.choices,
        'kpis': {
            'total': mboxes.count(),
            'held': mboxes.filter(holder__isnull=False).count(),
            'vacant': mboxes.filter(holder__isnull=True).count(),
            'unlocked': mboxes.filter(is_unlocked=True).count(),
            'reveals': sum(m.reveal_count for m in mboxes),
        },
    })


@login_required
def accounts_manage_view(request):
    """HQ Master User Accounts, Directory & Seat Control (accounts.js — #/accounts)."""
    q = (request.GET.get('q') or '').strip()
    flt = (request.GET.get('f') or 'all').strip()
    temp_sheet = None

    if request.method == 'POST' and request.user.is_in_hq():
        action = request.POST.get('action')
        if action == 'create_account':
            email = (request.POST.get('email') or '').strip().lower()
            first_name = (request.POST.get('first_name') or '').strip()
            last_name = (request.POST.get('last_name') or '').strip()
            network = request.POST.get('network') or 'WGMN'
            unit_id = request.POST.get('org_unit_id')
            role = request.POST.get('role') or ''
            hq_fn = request.POST.get('hq_function') or None
            pw = request.POST.get('password') or f"Woddi{secrets.token_hex(2).upper()}!"

            if email and first_name and not Profile.objects.filter(email__iexact=email).exists():
                unit = OrgUnit.objects.filter(pk=unit_id).first() if unit_id else OrgUnit.objects.first()
                p = Profile.objects.create_user(
                    email=email,
                    password=pw,
                    first_name=first_name,
                    last_name=last_name,
                    network=network,
                    org_unit=unit,
                    hq_function=hq_fn,
                    is_leader=bool(role and role not in ('member', 'volunteer')),
                    status=MemberStatus.ACTIVE,
                )
                if role:
                    RoleAssignment.objects.create(
                        profile=p,
                        role=role,
                        org_unit=unit,
                        assigned_by=request.user,
                        appointment_status='appointed',
                    )
                messages.success(request, f"Created account for {p.full_name} ({email}) — Temporary password: {pw}")
            else:
                messages.error(request, "Email is required and must be unique.")
            return redirect('onboarding:accounts_manage')

        elif action == 'assign_seat':
            pid = request.POST.get('profile_id')
            role = request.POST.get('role')
            unit_id = request.POST.get('org_unit_id')
            appt_status = request.POST.get('appointment_status') or 'appointed'
            target = get_object_or_404(Profile, pk=pid)
            unit = get_object_or_404(OrgUnit, pk=unit_id)
            RoleAssignment.objects.create(
                profile=target,
                role=role,
                org_unit=unit,
                assigned_by=request.user,
                appointment_status=appt_status,
            )
            target.is_leader = True
            target.org_unit = unit
            target.save(update_fields=['is_leader', 'org_unit'])
            messages.success(request, f"Seated {target.full_name} as {get_role_title(role, target.network)} at {unit.name}.")
            return redirect('onboarding:accounts_manage')

        elif action == 'end_roles':
            pid = request.POST.get('profile_id')
            target = get_object_or_404(Profile, pk=pid)
            target.roles.filter(ends_at__isnull=True).update(ends_at=timezone.now())
            target.is_leader = False
            target.save(update_fields=['is_leader'])
            messages.success(request, f"Ended active leadership seats for {target.full_name}.")
            return redirect('onboarding:accounts_manage')

        elif action == 'set_hq_function':
            pid = request.POST.get('profile_id')
            hq_fn = (request.POST.get('hq_function') or '').strip() or None
            target = get_object_or_404(Profile, pk=pid)
            target.hq_function = hq_fn
            target.save(update_fields=['hq_function'])
            messages.success(request, f"Set HQ function for {target.full_name} to {hq_fn or 'None'}.")
            return redirect('onboarding:accounts_manage')

        elif action == 'set_status':
            pid = request.POST.get('profile_id')
            new_st = request.POST.get('status')
            target = get_object_or_404(Profile, pk=pid)
            target.status = new_st
            target.save(update_fields=['status'])
            messages.success(request, f"Updated status for {target.full_name} to {target.get_status_display()}.")
            return redirect('onboarding:accounts_manage')

        elif action == 'reset_password':
            pid = request.POST.get('profile_id')
            new_pw = request.POST.get('new_password') or f"Woddi{secrets.token_hex(2).upper()}!"
            target = get_object_or_404(Profile, pk=pid)
            target.set_password(new_pw)
            target.save()
            messages.success(request, f"Reset password for {target.full_name} ({target.email}) to: {new_pw}")
            return redirect('onboarding:accounts_manage')

        elif action == 'toggle_suspend':
            pid = request.POST.get('profile_id')
            target = get_object_or_404(Profile, pk=pid)
            target.is_suspended = not target.is_suspended
            target.is_active = not target.is_suspended
            target.save(update_fields=['is_suspended', 'is_active'])
            messages.success(request, f"{'Suspended' if target.is_suspended else 'Restored'} {target.full_name}.")
            return redirect('onboarding:accounts_manage')

        elif action == 'complete_sheet':
            targets = Profile.objects.filter(is_leader=True).select_related('org_unit')[:50]
            temp_sheet = []
            for t in targets:
                pw = f"Woddi{secrets.token_hex(2).upper()}!"
                if not t.last_login or request.POST.get('reset_all') == '1':
                    t.set_password(pw)
                    t.save()
                else:
                    pw = '(Already signed in — unchanged)'
                seat = t.get_roles().first()
                temp_sheet.append({
                    'name': t.full_name,
                    'email': t.email,
                    'network': t.network,
                    'unit': seat.org_unit.name if seat else (t.org_unit.name if t.org_unit else ''),
                    'role': seat.get_role_display() if seat else t.role_applied,
                    'temp_password': pw,
                })

    profiles = Profile.objects.select_related('org_unit').prefetch_related('roles__org_unit').order_by('first_name', 'last_name')
    if q:
        profiles = profiles.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q) | Q(membership_no__icontains=q)
        )
    if flt == 'leaders':
        profiles = profiles.filter(Q(is_leader=True) | Q(roles__isnull=False)).distinct()
    elif flt == 'never':
        profiles = profiles.filter(last_login__isnull=True)
    elif flt == 'suspended':
        profiles = profiles.filter(is_suspended=True)
    elif flt == 'pending':
        profiles = profiles.filter(roles__accepted_at__isnull=True, roles__ends_at__isnull=True).distinct()

    units = OrgUnit.objects.filter(is_active=True).order_by('name')

    return render(request, 'onboarding/hq/accounts.html', {
        'tab': 'dashboard',
        'page_title': 'HQ Accounts & Seat Management',
        'q': q,
        'flt': flt,
        'profiles': profiles[:100],
        'units': units,
        'roles': RoleCode.choices,
        'statuses': MemberStatus.choices,
        'hq_functions': list(HQ_FUNCTION_LABELS.items()),
        'temp_sheet': temp_sheet,
    })


@login_required
def view_as_view(request, pk):
    """HQ Read-Only Impersonation Preview (app.js — #/view-as/:id)."""
    target = get_object_or_404(Profile, pk=pk)
    if target.is_in_hq():
        fn = target.hq_function or 'founder'
        if fn == 'founder':
            return central_view(request, view_as_target=target)
        elif fn == 'hofco':
            return hofco_view(request, view_as_target=target)
        return role_home_view(request, view_as_target=target)
    from onboarding.views_leader import leader_home_view
    return leader_home_view(request, subtab='home', view_as_target=target)


@login_required
def hq_staff_view(request):
    """Internal HQ Staff Operations (hq.js — #/hq: Staff Reports, Review Queue, Staff Tasks, Staff Directory)."""
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'submit_staff_report':
            period = request.POST.get('period') or 'weekly'
            report_date = request.POST.get('report_date') or timezone.now().date()
            tasks_completed = (request.POST.get('tasks_completed') or '').strip()
            tasks_in_progress = (request.POST.get('tasks_in_progress') or '').strip()
            challenges = (request.POST.get('challenges') or '').strip()
            support_required = (request.POST.get('support_required') or '').strip()
            next_priorities = (request.POST.get('next_priorities') or '').strip()
            if tasks_completed:
                StaffReport.objects.create(
                    author=request.user,
                    period=period,
                    report_date=report_date,
                    tasks_completed=tasks_completed,
                    tasks_in_progress=tasks_in_progress,
                    challenges=challenges,
                    support_required=support_required,
                    next_priorities=next_priorities,
                    status='submitted',
                )
                messages.success(request, "Submitted your HQ staff work report.")
            return redirect('onboarding:hq_staff')

        elif action == 'review_staff_report' and request.user.is_in_hq():
            rep_id = request.POST.get('report_id')
            decision = request.POST.get('decision') or 'approved'
            note = (request.POST.get('reviewer_note') or '').strip()
            rep = get_object_or_404(StaffReport, pk=rep_id)
            rep.status = decision
            rep.reviewer = request.user
            rep.reviewer_note = note
            rep.reviewed_at = timezone.now()
            rep.save()
            messages.success(request, f"Marked report by {rep.author.full_name} as {decision}.")
            return redirect('onboarding:hq_staff')

        elif action == 'add_staff' and request.user.is_in_hq():
            pid = request.POST.get('profile_id')
            dept_id = request.POST.get('department_id')
            title = (request.POST.get('position_title') or '').strip()
            if pid and dept_id and title:
                prof = get_object_or_404(Profile, pk=pid)
                dept = get_object_or_404(Department, pk=dept_id)
                Staff.objects.update_or_create(
                    profile=prof,
                    defaults={'department': dept, 'position_title': title, 'is_active': True}
                )
                prof.is_staff = True
                prof.save(update_fields=['is_staff'])
                messages.success(request, f"Added {prof.full_name} to HQ Staff Roster ({dept.name}).")
            return redirect('onboarding:hq_staff')

    my_reports = StaffReport.objects.filter(author=request.user).order_by('-report_date')
    review_queue = StaffReport.objects.select_related('author').order_by('-report_date')[:30]
    staff_roster = Staff.objects.select_related('profile', 'department').all()
    departments = Department.objects.filter(is_active=True)
    all_profiles = Profile.objects.order_by('first_name')[:100]

    return render(request, 'onboarding/hq/hq_staff.html', {
        'tab': 'dashboard',
        'page_title': 'HQ Staff Operations & Work Reports',
        'my_reports': my_reports,
        'review_queue': review_queue,
        'staff_roster': staff_roster,
        'departments': departments,
        'all_profiles': all_profiles,
    })
