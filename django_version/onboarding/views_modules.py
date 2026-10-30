import csv
import secrets
import uuid
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count, Sum
from django.http import HttpResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone

from core.models import (
    Profile, OrgUnit, OrgLevel, RoleAssignment, RoleCode,
    MemberStatus, AuditLog, OrgSetting, get_role_title,
)
from members.models import Application, Referral, PositionMailbox
from activation.models import CandidateActivation
from onboarding.steps import REQUIRED_DOCS
from operations.models import (
    Task, TaskStatus, Priority, TaskChecklistItem, TaskComment,
    Announcement, AnnouncementRead, StaffMessage,
    ReportTemplate, LeaderReport, ActivityRecord, Issue,
    Programme, ProgrammeEvent, Beneficiary, ServiceRecord,
    CaseFile, CaseUpdate, HelpdeskTicket, TicketMessage,
    MessageTemplate, DocumentFolder, Document,
    Course, CourseModule, CourseQuestion, CourseEnrollment,
    EngagementItem, EngagementFollowUp, SpotlightNomination,
    OutreachContact, AutomationRule, AutomationEvent, UatFeedback, MemberNotice,
)


MEMBER_STATUS_NEXT = {
    'applicant': ['under_review', 'approved', 'suspended'],
    'under_review': ['approved', 'applicant', 'suspended'],
    'approved': ['onboarding', 'active', 'activated', 'suspended'],
    'onboarding': ['active', 'activated', 'leader', 'suspended'],
    'active': ['activated', 'leader', 'inactive', 'alumni', 'suspended'],
    'activated': ['leader', 'active', 'inactive', 'alumni', 'suspended'],
    'leader': ['active', 'inactive', 'alumni', 'suspended'],
    'inactive': ['active', 'alumni', 'suspended'],
    'alumni': ['active'],
    'suspended': ['active', 'inactive'],
}

CASE_STATUS_NEXT = {
    'submitted': ['under_review', 'investigating', 'dismissed'],
    'filed': ['under_review', 'investigating', 'dismissed'],
    'under_review': ['investigating', 'escalated', 'resolved', 'dismissed'],
    'investigating': ['escalated', 'resolved', 'dismissed'],
    'escalated': ['resolved', 'dismissed'],
    'resolved': [],
    'dismissed': [],
}


@login_required
def organisation_view(request, unit_id=None):
    """Organisation Hierarchy, Child Unit Creation & Seat Appointment (organisation.js)."""
    units = OrgUnit.objects.filter(is_active=True).select_related('parent').order_by('level', 'name')
    selected = get_object_or_404(OrgUnit, pk=unit_id) if unit_id else (
        request.user.org_unit or units.filter(level=OrgLevel.HEADQUARTERS).first() or units.first()
    )
    can_manage = request.user.can_manage_unit(selected) if selected else request.user.is_in_hq()

    if request.method == 'POST' and can_manage:
        action = request.POST.get('action')
        if action == 'create_unit':
            name = (request.POST.get('name') or '').strip()
            code = (request.POST.get('code') or f"UNIT-{secrets.token_hex(2).upper()}").strip().upper()
            level = request.POST.get('level') or OrgLevel.CHAPTER
            net = request.POST.get('network') or 'BOTH'
            if name and selected:
                new_u = OrgUnit.objects.create(
                    name=name, level=level, parent=selected,
                    country_iso=selected.country_iso, network=net if net in ('WGMN', 'WNNN') else ''
                )
                AuditLog.objects.create(
                    actor=request.user, action='org_unit.create', entity_type='OrgUnit',
                    entity_id=str(new_u.id), summary=f"Created {new_u.get_level_display()} '{name}' under {selected.name}."
                )
                messages.success(request, f"Created organisational unit '{name}'.")
                return redirect('onboarding:organisation_unit', unit_id=new_u.id)

        elif action == 'appoint_leader':
            pid = request.POST.get('profile_id')
            role = request.POST.get('role') or RoleCode.CHAPTER_LEAD
            appt_status = request.POST.get('appointment_status') or 'appointed'
            reason = (request.POST.get('reason') or 'Seated via Organisation Command').strip()
            target = get_object_or_404(Profile, pk=pid)
            RoleAssignment.objects.create(
                profile=target, role=role, org_unit=selected,
                assigned_by=request.user, appointment_status=appt_status, reason=reason
            )
            target.is_leader = True
            target.org_unit = selected
            target.save(update_fields=['is_leader', 'org_unit'])
            AuditLog.objects.create(
                actor=request.user, action='role_assignment.create', entity_type='RoleAssignment',
                entity_id=str(target.id), summary=f"Appointed {target.full_name} as {role} at {selected.name} ({reason})."
            )
            messages.success(request, f"Appointed {target.full_name} to {selected.name}.")
            return redirect('onboarding:organisation_unit', unit_id=selected.id)

        elif action == 'end_role':
            ra_id = request.POST.get('assignment_id')
            reason = (request.POST.get('reason') or '').strip()
            if len(reason) < 5:
                messages.error(request, "A governance reason of at least 5 characters is required to end a leadership seat.")
            else:
                ra = get_object_or_404(RoleAssignment, pk=ra_id)
                ra.ends_at = timezone.now()
                ra.reason = reason
                ra.save(update_fields=['ends_at', 'reason'])
                AuditLog.objects.create(
                    actor=request.user, action='role_assignment.end', entity_type='RoleAssignment',
                    entity_id=str(ra.id), summary=f"Ended role {ra.role} for {ra.profile.full_name}: {reason}"
                )
                messages.success(request, f"Ended seat for {ra.profile.full_name}.")
            return redirect('onboarding:organisation_unit', unit_id=selected.id)

    children = OrgUnit.objects.filter(parent=selected, is_active=True) if selected else OrgUnit.objects.none()
    unit_roles = RoleAssignment.objects.filter(org_unit=selected, ends_at__isnull=True).select_related('profile') if selected else []
    unit_members = Profile.objects.filter(org_unit=selected) if selected else []
    all_profiles = Profile.objects.order_by('first_name')[:150]

    return render(request, 'onboarding/modules/organisation.html', {
        'tab': 'structure',
        'page_title': 'Organisation Hierarchy & Governance Units',
        'units': units,
        'selected': selected,
        'can_manage': can_manage,
        'children': children,
        'unit_roles': unit_roles,
        'unit_members': unit_members,
        'all_profiles': all_profiles,
        'levels': OrgLevel.choices,
        'roles': RoleCode.choices,
    })


@login_required
def country_hq_view(request, iso=None):
    """Country HQ & Country Structure Drill-down (countryhq.js & country.js)."""
    countries = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True).order_by('name')
    country_unit = None
    if iso:
        try:
            uuid_val = uuid.UUID(str(iso))
            country_unit = countries.filter(pk=uuid_val).first()
        except ValueError:
            country_unit = countries.filter(Q(country_iso__iexact=str(iso)) | Q(name__icontains=str(iso))).first()
    if not country_unit:
        country_unit = (
            countries.filter(name__icontains=request.user.country or 'Nigeria').first()
            or countries.first()
        )

    states = OrgUnit.objects.filter(parent=country_unit, is_active=True).order_by('name') if country_unit else []
    country_seats = RoleAssignment.objects.filter(
        Q(org_unit=country_unit) | Q(org_unit__parent=country_unit),
        ends_at__isnull=True
    ).select_related('profile', 'org_unit') if country_unit else []

    return render(request, 'onboarding/modules/country_hq.html', {
        'tab': 'structure',
        'page_title': f"Country Secretariat — {country_unit.name if country_unit else 'Continental'}",
        'countries': countries,
        'country_unit': country_unit,
        'states': states,
        'country_seats': country_seats,
    })


@login_required
def structure_view(request):
    """Leadership Structure & Seats Register (structure.js — #/structure)."""
    net = (request.GET.get('net') or 'all').strip()
    country_f = (request.GET.get('country') or '').strip()
    level_f = (request.GET.get('level') or '').strip()
    q = (request.GET.get('q') or '').strip()

    seats = RoleAssignment.objects.filter(ends_at__isnull=True).select_related('profile', 'org_unit')
    if net in ('WGMN', 'WNNN'):
        seats = seats.filter(profile__network=net)
    if country_f:
        seats = seats.filter(Q(org_unit__country_iso__icontains=country_f) | Q(org_unit__name__icontains=country_f))
    if level_f:
        seats = seats.filter(org_unit__level=level_f)
    if q:
        seats = seats.filter(
            Q(profile__first_name__icontains=q) | Q(profile__last_name__icontains=q) | Q(org_unit__name__icontains=q)
        )

    all_units = OrgUnit.objects.filter(is_active=True).prefetch_related('role_assignments')
    vacant_units = [u for u in all_units if not u.role_assignments.filter(ends_at__isnull=True).exists()]

    return render(request, 'onboarding/modules/structure.html', {
        'tab': 'structure',
        'page_title': 'Leadership Structure & Seats Register',
        'net': net,
        'country_f': country_f,
        'level_f': level_f,
        'q': q,
        'seats': seats,
        'vacant_units': vacant_units[:50],
        'levels': OrgLevel.choices,
    })


@login_required
def leaders_atlas_view(request):
    """Country & State Leaders Atlas + Spotlight Nominations (leaders.js & leadership.js)."""
    net = (request.GET.get('net') or 'all').strip()
    q = (request.GET.get('q') or '').strip()

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'nominate_spotlight':
            pid = request.POST.get('nominee_id')
            citation = (request.POST.get('citation') or '').strip()
            achievements = (request.POST.get('achievements') or '').strip()
            if pid and citation:
                nominee = get_object_or_404(Profile, pk=pid)
                SpotlightNomination.objects.create(
                    nominee=nominee, nominated_by=request.user,
                    category='SCA', citation=citation, evidence_summary=achievements
                )
                messages.success(request, f"Nominated {nominee.full_name} for Leader Spotlight!")
            return redirect('onboarding:leaders_atlas')

    leaders = Profile.objects.filter(Q(is_leader=True) | Q(roles__isnull=False)).distinct().select_related('org_unit').prefetch_related('roles__org_unit')
    if net in ('WGMN', 'WNNN'):
        leaders = leaders.filter(network=net)
    if q:
        leaders = leaders.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(country__icontains=q) | Q(email__icontains=q)
        )

    spotlights = SpotlightNomination.objects.filter(status='approved').select_related('nominee')[:6]

    return render(request, 'onboarding/modules/leaders_atlas.html', {
        'tab': 'structure',
        'page_title': 'Continental Leaders Atlas & Directory',
        'net': net,
        'q': q,
        'leaders': leaders[:120],
        'spotlights': spotlights,
    })


@login_required
def members_list_view(request):
    """Members & Volunteers Directory (members-list.js — #/members)."""
    q = (request.GET.get('q') or '').strip()
    net = (request.GET.get('net') or '').strip()
    st = (request.GET.get('status') or '').strip()
    country = (request.GET.get('country') or '').strip()

    qs = Profile.objects.select_related('org_unit').order_by('first_name', 'last_name')
    if q:
        qs = qs.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q) | Q(membership_no__icontains=q)
        )
    if net in ('WGMN', 'WNNN'):
        qs = qs.filter(network=net)
    if st:
        qs = qs.filter(status=st)
    if country:
        qs = qs.filter(country__icontains=country)

    return render(request, 'onboarding/modules/members_list.html', {
        'tab': 'members',
        'page_title': 'People, Members & Volunteers Directory',
        'q': q,
        'net': net,
        'st': st,
        'country': country,
        'members_list': qs[:120],
        'statuses': MemberStatus.choices,
    })


@login_required
def member_detail_view(request, pk):
    """360° Member & Leader Record + Audited Status State Machine (member-detail.js — #/members/:id)."""
    member = get_object_or_404(Profile, pk=pk)
    allowed_next = MEMBER_STATUS_NEXT.get(member.status, ['active', 'suspended'])

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'transition_status':
            new_status = request.POST.get('new_status')
            reason = (request.POST.get('reason') or '').strip()
            if len(reason) < 5:
                messages.error(request, "Please provide a governance reason (at least 5 characters) for this status change.")
            elif new_status in dict(MemberStatus.choices):
                old_status = member.status
                member.status = new_status
                member.is_suspended = (new_status == MemberStatus.SUSPENDED)
                if new_status == MemberStatus.LEADER:
                    member.is_leader = True
                member.save()
                AuditLog.objects.create(
                    actor=request.user, action='member.status_transition', entity_type='Profile',
                    entity_id=str(member.id),
                    summary=f"Changed status of {member.full_name} from {old_status} to {new_status}: {reason}"
                )
                messages.success(request, f"Transitioned {member.full_name} to {member.get_status_display()}.")
            return redirect('onboarding:member_detail', pk=member.id)

        elif action == 'send_notice':
            title = (request.POST.get('title') or '').strip()
            body = (request.POST.get('body') or '').strip()
            kind = request.POST.get('kind') or 'acknowledgement'
            if title and body:
                MemberNotice.objects.create(
                    recipient=member, kind=kind, title=title, body=body
                )
                messages.success(request, f"Posted {kind} notice to {member.full_name}'s record.")
            return redirect('onboarding:member_detail', pk=member.id)

    roles = member.roles.select_related('org_unit').order_by('-starts_at')
    tasks = Task.objects.filter(assigned_to=member).order_by('-created_at')[:15]
    reports = LeaderReport.objects.filter(author=member).order_by('-created_at')[:15]
    activities = ActivityRecord.objects.filter(author=member).order_by('-activity_date')[:15]
    notices = MemberNotice.objects.filter(recipient=member).order_by('-created_at')
    audit_logs = AuditLog.objects.filter(record_id=str(member.id)).order_by('-occurred_at')[:20]

    return render(request, 'onboarding/modules/member_detail.html', {
        'tab': 'members',
        'page_title': f"{member.full_name} — 360° Record",
        'member': member,
        'allowed_next': allowed_next,
        'roles': roles,
        'tasks': tasks,
        'reports': reports,
        'activities': activities,
        'notices': notices,
        'audit_logs': audit_logs,
    })


@login_required
def recruitment_view(request, pk=None):
    """Recruitment, Applications & Referral Links Pipeline (recruitment.js & reflinks.js)."""
    st = (request.GET.get('status') or '').strip()
    net = (request.GET.get('net') or '').strip()
    selected_app = get_object_or_404(Application, pk=pk) if pk else None

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'review_application':
            app_id = request.POST.get('application_id')
            app_obj = get_object_or_404(Application, pk=app_id)
            decision = request.POST.get('decision') or 'under_review'
            note = (request.POST.get('decision_note') or '').strip()
            app_obj.status = decision
            app_obj.decision_note = note
            app_obj.reviewed_by = request.user
            app_obj.reviewed_at = timezone.now()
            app_obj.save()

            if decision == 'approved':
                prof, created = Profile.objects.get_or_create(
                    email=app_obj.email.lower(),
                    defaults={
                        'first_name': app_obj.first_name,
                        'last_name': app_obj.last_name,
                        'phone': app_obj.phone,
                        'network': app_obj.network,
                        'country': app_obj.country or 'Nigeria',
                        'org_unit': app_obj.org_unit,
                        'status': MemberStatus.APPROVED,
                    }
                )
                if created:
                    prof.set_password('Woddi2026!')
                    prof.save()
                messages.success(request, f"Approved application for {app_obj.full_name} and provisioned profile.")
            else:
                messages.success(request, f"Updated application status for {app_obj.full_name} to {decision}.")
            return redirect('onboarding:recruitment')

        elif action == 'create_reflink':
            code = (request.POST.get('referral_code') or f"WODDI-{secrets.token_hex(2).upper()}").strip().upper()
            label = (request.POST.get('label') or '').strip()
            target_net = request.POST.get('network') or 'WGMN'
            route = request.POST.get('route') or 'ref3'
            Referral.objects.update_or_create(
                referral_code=code,
                defaults={
                    'referrer': request.user, 'label': label, 'network': target_net,
                    'route': route, 'org_unit': request.user.org_unit, 'is_active': True
                }
            )
            messages.success(request, f"Saved referral campaign link /r/{code}/ ({target_net}).")
            return redirect('onboarding:recruitment')

    apps = Application.objects.select_related('org_unit').order_by('-created_at')
    if st:
        apps = apps.filter(status=st)
    if net in ('WGMN', 'WNNN'):
        apps = apps.filter(network=net)

    reflinks = Referral.objects.select_related('referrer', 'org_unit').order_by('-created_at')[:50]

    return render(request, 'onboarding/modules/recruitment.html', {
        'tab': 'members',
        'page_title': 'Recruitment, Applications & Referral Links',
        'st': st,
        'net': net,
        'applications': apps[:100],
        'selected_app': selected_app,
        'reflinks': reflinks,
    })


@login_required
def tasks_module_view(request, pk=None):
    """Tasks & Follow-Up Engine (tasks.js — #/tasks, #/tasks/:id)."""
    scope = (request.GET.get('scope') or 'mine').strip()
    view_mode = (request.GET.get('view') or 'list').strip()
    selected_task = get_object_or_404(Task, pk=pk) if pk else None
    now = timezone.now()

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create_task':
            title = (request.POST.get('title') or '').strip()
            details = (request.POST.get('details') or '').strip()
            assignee_id = request.POST.get('assigned_to')
            priority = request.POST.get('priority') or Priority.NORMAL
            due_on = request.POST.get('due_on') or None
            req_resp = request.POST.get('require_response') == '1'
            req_evid = request.POST.get('require_evidence') == '1'
            assignee = Profile.objects.filter(pk=assignee_id).first() or request.user
            unit = assignee.org_unit or request.user.org_unit or OrgUnit.objects.first()
            if title and unit:
                t = Task.objects.create(
                    title=title, details=details, org_unit=unit,
                    assigned_to=assignee, assigned_by=request.user,
                    priority=priority, due_on=due_on,
                    require_response=req_resp, require_evidence=req_evid,
                )
                messages.success(request, f"Created task '{t.title}' for {assignee.full_name}.")
                return redirect('onboarding:task_detail', pk=t.id)

        elif action == 'update_task_status' and selected_task:
            new_st = request.POST.get('status') or TaskStatus.IN_PROGRESS
            resp_note = (request.POST.get('response_note') or '').strip()
            evid_url = (request.POST.get('evidence_url') or '').strip()
            if resp_note:
                TaskComment.objects.create(task=selected_task, author=request.user, body=f"[Response]: {resp_note}")
            if evid_url:
                TaskComment.objects.create(task=selected_task, author=request.user, body=f"[Evidence]: {evid_url}")

            if new_st in (TaskStatus.COMPLETED, TaskStatus.AWAITING_REVIEW):
                if selected_task.require_response and not resp_note and not selected_task.comments.exists():
                    messages.error(request, "This task requires a written response before it can be marked complete.")
                    return redirect('onboarding:task_detail', pk=selected_task.id)
                if new_st == TaskStatus.COMPLETED:
                    selected_task.completed_at = now
            selected_task.status = new_st
            selected_task.save()
            messages.success(request, f"Updated task status to {selected_task.get_status_display()}.")
            return redirect('onboarding:task_detail', pk=selected_task.id)

        elif action == 'add_checklist' and selected_task:
            label = (request.POST.get('label') or '').strip()
            if label:
                TaskChecklistItem.objects.create(task=selected_task, label=label)
            return redirect('onboarding:task_detail', pk=selected_task.id)

        elif action == 'toggle_checklist' and selected_task:
            item_id = request.POST.get('item_id')
            item = get_object_or_404(TaskChecklistItem, pk=item_id, task=selected_task)
            item.is_done = not item.is_done
            item.save(update_fields=['is_done'])
            return redirect('onboarding:task_detail', pk=selected_task.id)

        elif action == 'add_comment' and selected_task:
            body = (request.POST.get('body') or '').strip()
            if body:
                TaskComment.objects.create(task=selected_task, author=request.user, body=body)
            return redirect('onboarding:task_detail', pk=selected_task.id)

    qs = Task.objects.select_related('assigned_to', 'assigned_by', 'org_unit').order_by('due_on', '-created_at')
    if scope == 'mine':
        qs = qs.filter(assigned_to=request.user)
    elif scope == 'assigned':
        qs = qs.filter(assigned_by=request.user)
    elif scope == 'overdue':
        qs = qs.filter(status__in=['pending', 'in_progress'], due_on__lt=now.date())
    elif scope == 'done':
        qs = qs.filter(status=TaskStatus.COMPLETED)

    all_leaders = Profile.objects.filter(Q(is_leader=True) | Q(pk=request.user.pk)).order_by('first_name')[:100]

    return render(request, 'onboarding/modules/tasks.html', {
        'tab': 'tasks',
        'page_title': 'Tasks & Follow-Up Engine',
        'scope': scope,
        'view_mode': view_mode,
        'tasks': qs[:100],
        'selected_task': selected_task,
        'all_leaders': all_leaders,
    })


@login_required
def reporting_view(request, report_id=None, subtab=None):
    """Reporting & Record Keeping Centre (reporting.js — #/reporting)."""
    subtab = (subtab or request.GET.get('subtab') or 'dashboard').strip()
    selected_report = get_object_or_404(LeaderReport, pk=report_id) if report_id else None
    templates = ReportTemplate.objects.all()

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'submit_report':
            tpl_id = request.POST.get('template_id')
            tpl = ReportTemplate.objects.filter(pk=tpl_id).first() or ReportTemplate.objects.first()
            if not tpl:
                tpl = ReportTemplate.objects.create(code='MONTHLY', title='Monthly Leadership Activity Report', category='monthly')
            title = (request.POST.get('title') or tpl.title).strip()
            period_label = (request.POST.get('period_label') or timezone.now().strftime('%Y-%m')).strip()
            is_nil = request.POST.get('is_nil_report') == '1'
            nil_reason = (request.POST.get('nil_reason') or '').strip()
            summary = (request.POST.get('summary') or '').strip()
            challenges = (request.POST.get('challenges') or '').strip()
            next_steps = (request.POST.get('next_steps') or '').strip()
            status_val = request.POST.get('status') or 'submitted'

            unit = request.user.org_unit or OrgUnit.objects.first()
            rep = LeaderReport.objects.create(
                template=tpl,
                author=request.user,
                org_unit=unit,
                period=period_label,
                is_nil=is_nil,
                nil_reason=nil_reason,
                data={'title': title, 'summary': summary, 'challenges': challenges, 'next_steps': next_steps},
                status=status_val,
                submitted_at=timezone.now() if status_val == 'submitted' else None,
            )
            messages.success(request, f"Saved report '{title}' ({rep.status}).")
            return redirect('onboarding:report_detail', report_id=rep.id)

        elif action == 'review_report' and selected_report:
            decision = request.POST.get('decision') or 'approved'
            note = (request.POST.get('reviewer_note') or '').strip()
            selected_report.status = decision
            selected_report.reviewed_by = request.user
            selected_report.review_note = note
            selected_report.reviewed_at = timezone.now()
            if decision == 'returned':
                selected_report.version += 1
            selected_report.save()
            messages.success(request, f"Marked report as {decision}.")
            return redirect('onboarding:report_detail', report_id=selected_report.id)

        elif action == 'log_activity':
            title = (request.POST.get('title') or '').strip()
            cat = (request.POST.get('category') or 'Community Outreach').strip()
            act_date = request.POST.get('activity_date') or timezone.now().date()
            reached = int(request.POST.get('beneficiaries_reached') or 0)
            summary = (request.POST.get('summary') or '').strip()
            unit = request.user.org_unit or OrgUnit.objects.first()
            if title and unit:
                ActivityRecord.objects.create(
                    org_unit=unit, author=request.user, activity_type=cat,
                    description=f"{title} — {summary}", activity_date=act_date, attendees_count=reached
                )
                messages.success(request, f"Logged field activity '{title}'.")
            return redirect('onboarding:reporting')

        elif action == 'log_issue':
            title = (request.POST.get('title') or '').strip()
            sev = request.POST.get('severity') or 'amber'
            desc = (request.POST.get('description') or '').strip()
            unit = request.user.org_unit or OrgUnit.objects.first()
            if title and unit:
                Issue.objects.create(
                    org_unit=unit, reported_by=request.user, title=title, severity=sev, description=desc
                )
                messages.success(request, f"Logged operational issue '{title}'.")
            return redirect('onboarding:reporting')

    my_reports = LeaderReport.objects.filter(author=request.user).select_related('template', 'org_unit').order_by('-created_at')
    review_queue = LeaderReport.objects.filter(status__in=['submitted', 'under_review', 'escalated']).select_related('template', 'author', 'org_unit').order_by('-submitted_at')
    activities = ActivityRecord.objects.select_related('org_unit', 'author').order_by('-activity_date')[:40]
    issues = Issue.objects.select_related('org_unit', 'reported_by').order_by('-created_at')[:30]

    return render(request, 'onboarding/modules/reporting.html', {
        'tab': 'activities',
        'page_title': 'Reporting, Compliance & Field Records',
        'subtab': subtab,
        'selected_report': selected_report,
        'templates': templates,
        'my_reports': my_reports,
        'review_queue': review_queue,
        'activities': activities,
        'issues': issues,
    })


@login_required
def reports_analytics_view(request):
    """Continental Reports & 14-Day Activity Analytics + CSV Export (reports.js — #/reports)."""
    if request.GET.get('export') == 'csv':
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="wdos-continental-reports.csv"'
        writer = csv.writer(resp)
        writer.writerow(['Report Template', 'Period', 'Author', 'Network', 'Unit', 'Status', 'Nil Report', 'Submitted At'])
        for r in LeaderReport.objects.select_related('template', 'author', 'org_unit').all():
            writer.writerow([
                r.template.title, r.period, r.author.full_name, r.author.network,
                r.org_unit.name, r.status, 'Yes' if r.is_nil else 'No',
                r.submitted_at.strftime('%Y-%m-%d') if r.submitted_at else '',
            ])
        return resp

    total_reports = LeaderReport.objects.count()
    approved_reports = LeaderReport.objects.filter(status='approved').count()
    total_activities = ActivityRecord.objects.count()
    total_beneficiaries = ActivityRecord.objects.aggregate(s=Sum('attendees_count'))['s'] or 0

    return render(request, 'onboarding/modules/reports_analytics.html', {
        'tab': 'activities',
        'page_title': 'Continental Reports & Impact Analytics',
        'total_reports': total_reports,
        'approved_reports': approved_reports,
        'total_activities': total_activities,
        'total_beneficiaries': total_beneficiaries,
        'recent_reports': LeaderReport.objects.select_related('template', 'author', 'org_unit')[:30],
    })


@login_required
def programmes_view(request):
    """Programmes, Events, Beneficiaries & Service Delivery (programmes.js — #/programmes)."""
    if request.method == 'POST':
        action = request.POST.get('action')
        unit = request.user.org_unit or OrgUnit.objects.first()
        if action == 'create_programme':
            name = (request.POST.get('name') or '').strip()
            summary = (request.POST.get('summary') or '').strip()
            if name:
                Programme.objects.create(
                    name=name, code=f"PRG-{secrets.token_hex(2).upper()}",
                    network=request.user.network or 'WGMN', description=summary, is_active=True
                )
                messages.success(request, f"Created programme '{name}'.")
        elif action == 'create_beneficiary':
            full_name = (request.POST.get('full_name') or '').strip()
            if full_name and unit:
                Beneficiary.objects.create(org_unit=unit, full_name=full_name, created_by=request.user)
                messages.success(request, f"Registered beneficiary '{full_name}'.")
        return redirect('onboarding:programmes')

    return render(request, 'onboarding/modules/programmes.html', {
        'tab': 'activities',
        'page_title': 'Programmes, Events & Beneficiaries',
        'programmes': Programme.objects.all(),
        'beneficiaries': Beneficiary.objects.select_related('org_unit')[:50],
    })


@login_required
def announcements_view(request):
    """Announcements & Bulletins (announcements.js — #/announcements)."""
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'post_announcement':
            title = (request.POST.get('title') or '').strip()
            body = (request.POST.get('body') or '').strip()
            audience = request.POST.get('audience') or 'all'
            unit = request.user.org_unit or OrgUnit.objects.first()
            if title and body and unit:
                Announcement.objects.create(
                    title=title, body=body, audience=audience,
                    author=request.user, org_unit=unit
                )
                messages.success(request, f"Published announcement '{title}'.")
        elif action == 'mark_read':
            ann_id = request.POST.get('announcement_id')
            ann = get_object_or_404(Announcement, pk=ann_id)
            AnnouncementRead.objects.get_or_create(announcement=ann, profile=request.user)
        return redirect('onboarding:announcements')

    read_ids = set(AnnouncementRead.objects.filter(profile=request.user).values_list('announcement_id', flat=True))
    anns = Announcement.objects.select_related('author').order_by('-created_at')

    return render(request, 'onboarding/modules/announcements.html', {
        'tab': 'dashboard',
        'page_title': 'Official Announcements & Bulletins',
        'announcements': anns,
        'read_ids': read_ids,
    })


@login_required
def messages_module_view(request):
    """Two-Way Internal Messaging with Hierarchy Wall (messages.js — #/messages)."""
    if request.method == 'POST':
        recip_id = request.POST.get('recipient_id')
        subject = (request.POST.get('subject') or 'WDOS Message').strip()
        body = (request.POST.get('body') or '').strip()
        recip = Profile.objects.filter(pk=recip_id).first()
        if recip and body:
            StaffMessage.objects.create(sender=request.user, recipient=recip, subject=subject, body=body)
            messages.success(request, f"Message sent to {recip.full_name}.")
        return redirect('onboarding:messages')

    inbox = StaffMessage.objects.filter(recipient=request.user).select_related('sender').order_by('-created_at')
    sent = StaffMessage.objects.filter(sender=request.user).select_related('recipient').order_by('-created_at')
    contacts = Profile.objects.exclude(pk=request.user.pk).order_by('first_name')[:100]

    return render(request, 'onboarding/modules/messages.html', {
        'tab': 'dashboard',
        'page_title': 'Internal Messaging & Directives',
        'inbox': inbox,
        'sent': sent,
        'contacts': contacts,
    })


@login_required
def cases_view(request, pk=None):
    """Confidential Safeguarding, Conduct & Ethics Cases (cases.js — #/cases, #/cases/:id)."""
    selected_case = get_object_or_404(CaseFile, pk=pk) if pk else None
    allowed_next = CASE_STATUS_NEXT.get(selected_case.status, ['under_review', 'resolved']) if selected_case else []

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'file_case':
            title = (request.POST.get('title') or '').strip()
            category = request.POST.get('category') or 'safeguarding'
            description = (request.POST.get('description') or '').strip()
            if title and description:
                c = CaseFile.objects.create(
                    case_no=f"CASE-{secrets.token_hex(3).upper()}",
                    reporter=request.user, org_unit=request.user.org_unit,
                    category=category, subject=title, details=description
                )
                messages.success(request, f"Filed confidential case {c.case_no}.")
                return redirect('onboarding:case_detail', pk=c.id)

        elif action == 'update_case' and selected_case:
            new_st = request.POST.get('status') or selected_case.status
            note = (request.POST.get('note') or '').strip()
            if note:
                CaseUpdate.objects.create(case=selected_case, author=request.user, note=note)
            if new_st != selected_case.status:
                selected_case.status = new_st
                selected_case.save(update_fields=['status'])
            messages.success(request, "Recorded case update.")
            return redirect('onboarding:case_detail', pk=selected_case.id)

    cases = CaseFile.objects.select_related('reporter', 'org_unit').order_by('-created_at')
    if not request.user.is_in_hq():
        cases = cases.filter(reporter=request.user)

    return render(request, 'onboarding/modules/cases.html', {
        'tab': 'dashboard',
        'page_title': 'Safeguarding, Conduct & Ethics Case Registry',
        'cases': cases,
        'selected_case': selected_case,
        'allowed_next': allowed_next,
    })


@login_required
def helpdesk_view(request, pk=None):
    """Helpdesk & Support Tickets (helpdesk.js — #/helpdesk, #/helpdesk/:id)."""
    selected_ticket = get_object_or_404(HelpdeskTicket, pk=pk) if pk else None

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create_ticket':
            cat = request.POST.get('category') or 'general'
            subj = (request.POST.get('subject') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            if subj and desc:
                tk = HelpdeskTicket.objects.create(
                    ticket_no=f"TKT-{secrets.token_hex(3).upper()}",
                    requester=request.user, category=cat, subject=subj, details=desc
                )
                messages.success(request, f"Created support ticket '{tk.subject}'.")
                return redirect('onboarding:helpdesk_detail', pk=tk.id)

        elif action == 'reply_ticket' and selected_ticket:
            body = (request.POST.get('body') or '').strip()
            new_st = request.POST.get('status') or selected_ticket.status
            if body:
                TicketMessage.objects.create(ticket=selected_ticket, author=request.user, body=body)
            selected_ticket.status = new_st
            selected_ticket.save(update_fields=['status'])
            messages.success(request, "Updated support ticket.")
            return redirect('onboarding:helpdesk_detail', pk=selected_ticket.id)

    tickets = HelpdeskTicket.objects.select_related('requester').order_by('-created_at')
    if not request.user.is_in_hq():
        tickets = tickets.filter(requester=request.user)

    return render(request, 'onboarding/modules/helpdesk.html', {
        'tab': 'dashboard',
        'page_title': 'HQ Helpdesk & Support Centre',
        'tickets': tickets,
        'selected_ticket': selected_ticket,
    })


@login_required
def library_view(request):
    """Multi-Locale Message Library & Template Studio (library.js — #/library, 8 locales)."""
    locale = (request.GET.get('locale') or 'en').strip()
    locales = [('en', 'English'), ('fr', 'Français'), ('pt', 'Português'), ('ar', 'العربية'),
               ('sw', 'Kiswahili'), ('ha', 'Hausa'), ('yo', 'Yorùbá'), ('ig', 'Igbo')]

    if request.method == 'POST':
        code = (request.POST.get('code') or '').strip().upper()
        loc = request.POST.get('locale') or 'en'
        subject = (request.POST.get('subject') or '').strip()
        body = (request.POST.get('body') or '').strip()
        status_val = request.POST.get('status') or 'approved'
        if code and body:
            MessageTemplate.objects.update_or_create(
                code=code, locale=loc,
                defaults={'name': subject or code, 'subject': subject, 'body': body, 'status': status_val}
            )
            messages.success(request, f"Saved message template '{code}' ({loc}).")
        return redirect(f"/workspace/library/?locale={loc}")

    templates = MessageTemplate.objects.filter(locale=locale)
    if not templates.exists():
        templates = MessageTemplate.objects.all()

    return render(request, 'onboarding/modules/library.html', {
        'tab': 'dashboard',
        'page_title': 'Multi-Language Message & Notification Library',
        'locale': locale,
        'locales': locales,
        'templates': templates,
    })


@login_required
def documents_view(request):
    """Governance Documents & File Repository (documents.js — #/documents)."""
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create_folder':
            name = (request.POST.get('name') or '').strip()
            if name:
                DocumentFolder.objects.create(name=name)
                messages.success(request, f"Created folder '{name}'.")
        elif action == 'upload_doc':
            folder_id = request.POST.get('folder_id')
            title = (request.POST.get('title') or '').strip()
            file_url = (request.POST.get('file_url') or '').strip()
            folder = DocumentFolder.objects.filter(pk=folder_id).first() or DocumentFolder.objects.first()
            if not folder:
                folder = DocumentFolder.objects.create(name='General Governance')
            if title and folder:
                Document.objects.create(
                    folder=folder, title=title, file_path=file_url, uploaded_by=request.user
                )
                messages.success(request, f"Added document '{title}'.")
        return redirect('onboarding:documents')

    return render(request, 'onboarding/modules/documents.html', {
        'tab': 'dashboard',
        'page_title': 'Official Documents & Policy Repository',
        'folders': DocumentFolder.objects.prefetch_related('documents').all(),
        'required_docs': REQUIRED_DOCS,
    })


@login_required
def engagement_view(request):
    """Engagement Calendar, Spotlight Review, Content Studio & Outreach (engagement.js, spotlight.js, content.js, outreach.js)."""
    mode = (request.GET.get('mode') or 'engagement').strip()
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create_engagement':
            title = (request.POST.get('title') or '').strip()
            item_type = request.POST.get('item_type') or 'event'
            net = request.POST.get('network') or 'both'
            desc = (request.POST.get('description') or '').strip()
            if title:
                EngagementItem.objects.create(
                    title=title, kind=item_type, network=net, focus=desc
                )
                messages.success(request, f"Published '{title}' to the Engagement Calendar & Content Studio.")
        elif action == 'review_spotlight':
            nom_id = request.POST.get('nomination_id')
            decision = request.POST.get('status') or 'approved'
            nom = get_object_or_404(SpotlightNomination, pk=nom_id)
            nom.status = decision
            nom.save(update_fields=['status'])
            messages.success(request, f"Marked spotlight nomination for {nom.nominee.full_name} as {decision}.")
        elif action == 'add_outreach':
            org_name = (request.POST.get('organisation_name') or '').strip()
            contact_person = (request.POST.get('contact_person') or '').strip()
            email = (request.POST.get('email') or 'partner@example.org').strip()
            country = (request.POST.get('country') or 'Nigeria').strip()
            if org_name:
                OutreachContact.objects.create(
                    organisation_name=org_name, contact_person=contact_person,
                    email=email, country=country
                )
                messages.success(request, f"Added partner '{org_name}' to Outreach CRM.")
        return redirect(f"/workspace/engagement/?mode={mode}")

    return render(request, 'onboarding/modules/engagement.html', {
        'tab': 'dashboard',
        'page_title': 'Engagement, Spotlight, Content Studio & Outreach CRM',
        'mode': mode,
        'items': EngagementItem.objects.order_by('-created_at')[:30],
        'spotlights': SpotlightNomination.objects.select_related('nominee', 'nominated_by').order_by('-created_at')[:30],
        'outreach_contacts': OutreachContact.objects.order_by('-created_at')[:40],
    })


@login_required
def system_tools_view(request, tool='settings'):
    """Settings, System Doctor, Ask WODDI Assistant, UAT Feedback & Planned Modules."""
    tool = (tool or request.GET.get('tool') or 'settings').strip()
    ask_answer = None
    ask_query = (request.GET.get('q') or '').strip()

    if ask_query:
        q_low = ask_query.lower()
        if 'wgmn' in q_low or 'wnnn' in q_low or 'age' in q_low:
            ask_answer = "Under the Founder's Network Assignment Rule, applicants aged 18–29 join the WODDI Nurture & Next-Gen Network (WNNN), while women aged 30+ join the WODDI Global Mothers & Women Network (WGMN)."
        elif 'onboard' in q_low or '10' in q_low:
            ask_answer = "Every appointed WODDI leader completes the 10-Step Leadership Onboarding (Role & TOR -> Reporting Line -> Leadership Pack -> Code of Conduct -> Safeguarding -> Confidentiality -> COI -> Communication Protocol -> Templates -> 30/60/90-Day Plan)."
        elif 'activation' in q_low or '3-day' in q_low or '7-day' in q_low:
            ask_answer = "Referred candidates complete the 3-Day Referral Activation (/join/WGMN/ or /join/WNNN/), while open applicants complete the 7-Day Activation & Readiness Assessment."
        else:
            ask_answer = f"WODDI Operating System (WDOS) Governance Guidance for '{ask_query}': Consult your Terms of Reference, the 10-Step Onboarding Pack, or contact HQ Support via #/helpdesk."

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'submit_uat':
            page_route = (request.POST.get('page_route') or '/workspace/').strip()
            category = (request.POST.get('category') or 'usability').strip()
            comment = (request.POST.get('comment') or '').strip()
            if comment:
                UatFeedback.objects.create(
                    user=request.user, role_tested=request.user.hq_function or 'leader',
                    page=page_route, category=category, comment=comment
                )
                messages.success(request, "Thank you! Your UAT feedback has been recorded.")
            return redirect('onboarding:uat_feedback')

    diagnostics = {
        'profiles': Profile.objects.count(),
        'org_units': OrgUnit.objects.count(),
        'active_seats': RoleAssignment.objects.filter(ends_at__isnull=True).count(),
        'mailboxes': PositionMailbox.objects.count(),
        'autopilot_rules': AutomationRule.objects.count(),
        'courses': Course.objects.count(),
        'templates': MessageTemplate.objects.count(),
    }

    return render(request, 'onboarding/modules/system_tools.html', {
        'tab': 'dashboard',
        'page_title': f"WDOS System — {tool.upper()}",
        'tool': tool,
        'ask_query': ask_query,
        'ask_answer': ask_answer,
        'diagnostics': diagnostics,
        'uat_list': UatFeedback.objects.select_related('user').order_by('-created_at')[:30],
    })
