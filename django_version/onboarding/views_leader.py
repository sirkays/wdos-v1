import json
import secrets
from pathlib import Path
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone

from core.models import (
    Profile, OrgUnit, OrgLevel, RoleAssignment, RoleCode,
    MemberStatus, AuditLog, OrgSetting, get_role_title,
)
from members.models import Application, Referral, PositionMailbox
from activation.models import CandidateActivation
from onboarding.steps import STEPS, REQUIRED_DOCS, _completed_map
from operations.models import (
    Task, TaskStatus, Announcement, StaffMessage, LeaderReport,
    ActivityRecord, DocumentFolder, Document, Course, CourseEnrollment,
    EngagementItem, HelpdeskTicket, CaseFile, MemberNotice,
)


OFFICIAL_TEMPLATES = [
    {'code': 'TOR', 'title': 'Leadership Terms of Reference', 'file': 'content/templates/leadership-terms-of-reference.html', 'category': 'Governance'},
    {'code': 'MONTHLY-REP', 'title': 'Monthly Leadership Activity Report Template', 'file': 'content/templates/monthly-activity-report.html', 'category': 'Reporting'},
    {'code': 'EVENT-REP', 'title': 'Programme / Event Report Template', 'file': 'content/templates/event-report-template.html', 'category': 'Programmes'},
    {'code': 'CHAPTER-CHARTER', 'title': 'Local Chapter Establishment Charter', 'file': 'content/templates/chapter-charter.html', 'category': 'Structure'},
    {'code': 'MEETING-MIN', 'title': 'Official Meeting Minutes Template', 'file': 'content/templates/meeting-minutes.html', 'category': 'Operations'},
    {'code': 'SAFEGUARD-INC', 'title': 'Safeguarding Incident Escalation Form', 'file': 'content/templates/safeguarding-incident-form.html', 'category': 'Safeguarding'},
    {'code': 'HANDOVER', 'title': 'Leadership Seat Handover Checklist', 'file': 'content/templates/handover-checklist.html', 'category': 'Governance'},
]


def _load_static_json(rel_path, fallback=None):
    try:
        p = Path(settings.BASE_DIR) / 'static' / rel_path
        if p.exists():
            return json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        pass
    return fallback or {}


@login_required
def leader_home_view(request, subtab='home', view_as_target=None):
    """
    Unified Leader & Volunteer Workspace Home (`home.js` — `#/` and `#/my/:tab`).
    """
    subject = view_as_target or request.user
    subtab = (subtab or request.GET.get('tab') or 'home').strip().lower()
    now = timezone.now()

    active_roles = list(subject.get_roles().select_related('org_unit'))
    primary_seat = active_roles[0] if active_roles else None
    is_seated_leader = bool(subject.is_leader or active_roles)
    is_deputy = any(
        r.role in (
            RoleCode.DEPUTY_COUNTRY_REP, RoleCode.ASSISTANT_STATE_COORDINATOR,
            RoleCode.CHAPTER_SECRETARY, RoleCode.STATE_SECRETARY, RoleCode.LGA_SECRETARY,
            RoleCode.WARD_SECRETARY, RoleCode.ASSISTANT_CHAPTER_LEAD, RoleCode.ASSISTANT_CHAPTER_COORDINATOR,
        )
        for r in active_roles
    )

    completed_steps = _completed_map(subject)
    onboarding_done = 'pack' in completed_steps
    onboarding_count = sum(1 for s in STEPS if s['code'] in completed_steps)
    onboarding_pct = int(round((onboarding_count / len(STEPS)) * 100)) if STEPS else 100

    # Check if position mailbox gate is unlocked
    gate_setting = OrgSetting.objects.filter(key='mailbox_gate').first()
    gate_mode = gate_setting.value.get('mode', 'activation_or_onboarding') if gate_setting else 'activation_or_onboarding'
    act_done = CandidateActivation.objects.filter(profile=subject, status='completed').exists()
    if gate_mode == 'open':
        mailbox_gate_open = True
    elif gate_mode == 'onboarding_only':
        mailbox_gate_open = onboarding_done
    else:
        mailbox_gate_open = onboarding_done or act_done or subject.status == MemberStatus.ACTIVATED

    mailbox = PositionMailbox.objects.filter(
        Q(holder=subject) | (Q(org_unit=subject.org_unit) if subject.org_unit else Q(pk__isnull=True))
    ).first()

    revealed_password = request.session.pop('revealed_mailbox_pw', None)

    if request.method == 'POST' and not view_as_target:
        action = request.POST.get('action')

        if action == 'accept_appointment' and primary_seat:
            primary_seat.accepted_at = now
            primary_seat.appointment_status = 'appointed'
            primary_seat.save(update_fields=['accepted_at', 'appointment_status'])
            AuditLog.objects.create(
                actor=subject, action='appointment.accept', entity_type='RoleAssignment',
                entity_id=str(primary_seat.id), summary=f"{subject.full_name} accepted seat {primary_seat.get_role_display()}."
            )
            messages.success(request, f"Appointment accepted: {primary_seat.network_title} ({primary_seat.org_unit.name}).")
            return redirect('onboarding:leader_home')

        elif action == 'decline_appointment' and primary_seat:
            reason = (request.POST.get('decline_reason') or 'Personal bandwidth').strip()
            primary_seat.declined_at = now
            primary_seat.decline_reason = reason
            primary_seat.ends_at = now
            primary_seat.save(update_fields=['declined_at', 'decline_reason', 'ends_at'])
            AuditLog.objects.create(
                actor=subject, action='appointment.decline', entity_type='RoleAssignment',
                entity_id=str(primary_seat.id), summary=f"{subject.full_name} declined seat: {reason}"
            )
            messages.warning(request, "Your response has been recorded and forwarded to HQ.")
            return redirect('onboarding:leader_home')

        elif action == 'mark_founder_welcome_seen' and primary_seat:
            primary_seat.founder_welcome_seen_at = now
            primary_seat.save(update_fields=['founder_welcome_seen_at'])
            messages.success(request, "Founder's Welcome acknowledged.")
            return redirect('onboarding:leader_home')

        elif action == 'update_profile':
            if not is_seated_leader:
                subject.first_name = (request.POST.get('first_name') or subject.first_name).strip()
                subject.last_name = (request.POST.get('last_name') or subject.last_name).strip()
                subject.country = (request.POST.get('country') or subject.country).strip()
            subject.phone = (request.POST.get('phone') or subject.phone or '').strip()
            subject.whatsapp = (request.POST.get('whatsapp') or subject.whatsapp or '').strip()
            subject.city = (request.POST.get('city') or subject.city or '').strip()
            subject.profession = (request.POST.get('profession') or subject.profession or '').strip()
            subject.bio = (request.POST.get('bio') or subject.bio or '').strip()
            subject.save()
            messages.success(request, "Your profile has been updated.")
            return redirect('onboarding:my_tab', subtab='profile')

        elif action == 'send_message':
            msg_subject = (request.POST.get('subject') or 'Message from Field Leader').strip()
            body = (request.POST.get('body') or '').strip()
            recip_id = request.POST.get('recipient_id')
            recip = Profile.objects.filter(pk=recip_id).first() if recip_id else Profile.objects.filter(hq_function__isnull=False).first()
            if body and recip:
                StaffMessage.objects.create(
                    sender=subject, recipient=recip, subject=msg_subject, body=body
                )
                messages.success(request, f"Message sent to {recip.full_name}.")
            return redirect('onboarding:my_tab', subtab='messages')

        elif action == 'create_referral':
            cand_name = (request.POST.get('candidate_name') or '').strip()
            cand_email = (request.POST.get('candidate_email') or '').strip().lower()
            cand_phone = (request.POST.get('candidate_phone') or '').strip()
            net = request.POST.get('network') or subject.network or 'WGMN'
            notes = (request.POST.get('notes') or '').strip()
            if cand_name and cand_email:
                code = f"REF-{secrets.token_hex(3).upper()}"
                Referral.objects.create(
                    referrer=subject,
                    referral_code=code,
                    candidate_name=cand_name,
                    candidate_email=cand_email,
                    candidate_phone=cand_phone,
                    network=net,
                    org_unit=subject.org_unit,
                    notes=notes,
                    route='ref3',
                    status='invited',
                )
                messages.success(request, f"Recorded referral for {cand_name} (Code: {code}). Share /join/{net}/ with them!")
            return redirect('onboarding:my_tab', subtab='referrals')

        elif action == 'complete_course':
            course_id = request.POST.get('course_id')
            course = get_object_or_404(Course, pk=course_id)
            score = int(request.POST.get('quiz_score') or 85)
            enrollment, _ = CourseEnrollment.objects.get_or_create(course=course, profile=subject)
            if score >= 70:
                enrollment.certified_at = now
                enrollment.cert_no = f"CERT-{secrets.token_hex(3).upper()}"
                enrollment.save()
                messages.success(request, f"Congratulations! You completed '{course.title}' ({enrollment.cert_no}).")
            else:
                messages.warning(request, f"You scored {score}%. A minimum of 70% is required to pass.")
            return redirect('onboarding:my_tab', subtab='learning')

        elif action == 'engagement_participate':
            item_id = request.POST.get('item_id')
            item = get_object_or_404(EngagementItem, pk=item_id)
            parts = list(item.participants or [])
            uid = str(subject.id)
            if uid not in parts:
                parts.append(uid)
                item.participants = parts
                item.save(update_fields=['participants'])
            messages.success(request, f"Confirmed your participation in '{item.title}'.")
            return redirect('onboarding:my_tab', subtab='calendar')

        elif action == 'submit_support_ticket':
            cat = request.POST.get('category') or 'general'
            subj = (request.POST.get('subject') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            if subj and desc:
                HelpdeskTicket.objects.create(
                    ticket_no=f"TKT-{secrets.token_hex(3).upper()}",
                    requester=subject, category=cat, subject=subj, details=desc
                )
                messages.success(request, "Support ticket submitted to HQ Helpdesk.")
            return redirect('onboarding:my_tab', subtab='support')

        elif action == 'submit_safeguarding':
            title = (request.POST.get('title') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            if title and desc:
                CaseFile.objects.create(
                    case_no=f"CASE-{secrets.token_hex(3).upper()}",
                    reporter=subject, org_unit=subject.org_unit, category='safeguarding',
                    subject=title, details=desc
                )
                messages.success(request, "Confidential safeguarding report filed with HQ Safeguarding & Ethics.")
            return redirect('onboarding:my_tab', subtab='safeguarding')

        elif action == 'change_password':
            new_pw = (request.POST.get('new_password') or '').strip()
            confirm_pw = (request.POST.get('confirm_password') or '').strip()
            if len(new_pw) < 6 or new_pw != confirm_pw:
                messages.error(request, "Passwords must match and be at least 6 characters.")
            else:
                subject.set_password(new_pw)
                subject.save()
                update_session_auth_hash(request, subject)
                messages.success(request, "Your password has been updated.")
            return redirect('onboarding:my_tab', subtab='settings')

    weekly_msg = _load_static_json('assets/hq-messages/week-01.json', {
        'title': 'Leading with Dignity, Accountability, and Sisterhood',
        'author': 'Office of the Founder & President',
        'summary': 'Every chapter, community cluster, and country secretariat is a beacon of hope. Stay anchored to our core values this week.',
    })
    monthly_msg = _load_static_json('assets/monthly/current.json', {
        'theme': 'Continental Grassroots Mobilisation & Chapter Strengthening',
        'month': now.strftime('%B %Y'),
    })

    child_units = OrgUnit.objects.filter(parent=subject.org_unit, is_active=True) if subject.org_unit else OrgUnit.objects.none()
    jurisdiction_leaders = Profile.objects.filter(
        Q(org_unit=subject.org_unit) | Q(org_unit__parent=subject.org_unit), is_leader=True
    ).exclude(pk=subject.pk)[:20] if subject.org_unit else Profile.objects.none()
    pending_apps = Application.objects.filter(org_unit=subject.org_unit, status__in=['submitted', 'under_review'])[:10] if subject.org_unit else Application.objects.none()

    my_tasks = Task.objects.filter(assigned_to=subject).order_by('due_on')[:15]
    my_reports = LeaderReport.objects.filter(author=subject).order_by('-created_at')[:15]
    my_activities = ActivityRecord.objects.filter(author=subject).order_by('-activity_date')[:15]
    my_messages = StaffMessage.objects.filter(Q(recipient=subject) | Q(sender=subject)).select_related('sender', 'recipient').order_by('-created_at')[:30]
    my_referrals = Referral.objects.filter(referrer=subject).order_by('-created_at')
    my_notices = MemberNotice.objects.filter(recipient=subject).order_by('-created_at')[:10]
    announcements = Announcement.objects.order_by('-created_at')[:8]

    courses = Course.objects.filter(is_active=True).prefetch_related('modules')
    enrollments = {e.course_id: e for e in CourseEnrollment.objects.filter(profile=subject)}
    course_cards = [{'course': c, 'enrollment': enrollments.get(c.id)} for c in courses]

    engagement_items = EngagementItem.objects.order_by('scheduled_date')[:20]
    my_tickets = HelpdeskTicket.objects.filter(requester=subject).order_by('-created_at')
    doc_files = Document.objects.select_related('folder').order_by('-created_at')[:25]
    hq_contacts = Profile.objects.filter(hq_function__isnull=False).order_by('first_name')[:15]

    return render(request, 'onboarding/leader_home/home.html', {
        'tab': 'dashboard',
        'page_title': f"{subject.full_name} — Leadership Workspace",
        'subject': subject,
        'view_as_target': view_as_target,
        'subtab': subtab,
        'active_roles': active_roles,
        'primary_seat': primary_seat,
        'is_seated_leader': is_seated_leader,
        'is_deputy': is_deputy,
        'onboarding_done': onboarding_done,
        'onboarding_count': onboarding_count,
        'onboarding_total': len(STEPS),
        'onboarding_pct': onboarding_pct,
        'steps_list': [
            {**s, 'completed': s['code'] in completed_steps}
            for s in STEPS
        ],
        'required_docs': REQUIRED_DOCS,
        'mailbox': mailbox,
        'mailbox_gate_open': mailbox_gate_open,
        'revealed_password': revealed_password,
        'weekly_msg': weekly_msg,
        'monthly_msg': monthly_msg,
        'child_units': child_units,
        'jurisdiction_leaders': jurisdiction_leaders,
        'pending_apps': pending_apps,
        'my_tasks': my_tasks,
        'my_reports': my_reports,
        'my_activities': my_activities,
        'my_messages': my_messages,
        'my_referrals': my_referrals,
        'my_notices': my_notices,
        'announcements': announcements,
        'course_cards': course_cards,
        'engagement_items': engagement_items,
        'my_tickets': my_tickets,
        'doc_files': doc_files,
        'official_templates': OFFICIAL_TEMPLATES,
        'hq_contacts': hq_contacts,
    })


@login_required
def reveal_mailbox_view(request):
    """Audited reveal of official @woddi.org position mailbox credentials (`home.js`)."""
    if request.method == 'POST':
        mbox_id = request.POST.get('mailbox_id')
        mbox = get_object_or_404(PositionMailbox, pk=mbox_id)
        mbox.reveal_count = (mbox.reveal_count or 0) + 1
        mbox.last_revealed_at = timezone.now()
        mbox.save(update_fields=['reveal_count', 'last_revealed_at'])
        AuditLog.objects.create(
            actor=request.user,
            action='mailbox.reveal_password',
            entity_type='PositionMailbox',
            entity_id=str(mbox.id),
            summary=f"{request.user.full_name} revealed password for {mbox.email_address}.",
        )
        request.session['revealed_mailbox_pw'] = mbox.password_plain or 'WoddiMail#2026!'
        messages.success(request, f"Credentials unlocked for {mbox.email_address} (Reveal #{mbox.reveal_count} logged).")
    return redirect('onboarding:leader_home')
