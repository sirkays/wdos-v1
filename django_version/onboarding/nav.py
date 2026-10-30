import json
from pathlib import Path
from django.conf import settings
from core.models import RoleCode, get_role_title
from onboarding.steps import gate_open


HASH_TO_DJANGO_URL = {
    '#/': '/workspace/',
    '#/ops': '/workspace/ops/',
    '#/ops/leaders': '/workspace/ops/leaders/',
    '#/ops/activity': '/workspace/ops/activity/',
    '#/ops/messages': '/workspace/ops/messages/',
    '#/ops/tasks': '/workspace/ops/tasks/',
    '#/ops/reports': '/workspace/ops/reports/',
    '#/ops/autopilot': '/workspace/ops/autopilot/',
    '#/organisation': '/workspace/organisation/',
    '#/command': '/workspace/command/',
    '#/recruitment': '/workspace/recruitment/',
    '#/hq/activation': '/workspace/hq-activation/',
    '#/hq/mailboxes': '/workspace/mailboxes/',
    '#/tasks?view=hq': '/workspace/tasks/?scope=hq',
    '#/tasks': '/workspace/tasks/',
    '#/programmes': '/workspace/programmes/',
    '#/planned/finance': '/workspace/planned/finance/',
    '#/planned/authority-matrix': '/workspace/planned/authority-matrix/',
    '#/planned/risk-register': '/workspace/planned/risk-register/',
    '#/planned/comms-production': '/workspace/planned/comms-production/',
    '#/planned/media-library': '/workspace/planned/media-library/',
    '#/planned/social': '/workspace/planned/social/',
    '#/planned/campaigns': '/workspace/planned/campaigns/',
    '#/planned/media-programmes': '/workspace/planned/media-programmes/',
    '#/planned/visibility-analytics': '/workspace/planned/visibility-analytics/',
    '#/planned/integrations': '/workspace/planned/integrations/',
    '#/planned/readiness': '/workspace/planned/readiness/',
    '#/members': '/workspace/members/',
    '#/announcements': '/workspace/announcements/',
    '#/reporting': '/workspace/reporting/',
    '#/reporting/dashboard': '/workspace/reporting/dashboard/',
    '#/reporting/mine': '/workspace/reporting/mine/',
    '#/reporting/review': '/workspace/reporting/review/',
    '#/reporting/compliance': '/workspace/reporting/compliance/',
    '#/reporting/records': '/workspace/reporting/records/',
    '#/reporting/issues': '/workspace/reporting/issues/',
    '#/reporting/archive': '/workspace/reporting/archive/',
    '#/cases': '/workspace/cases/',
    '#/doctor': '/workspace/doctor/',
    '#/accounts': '/workspace/accounts/',
    '#/accounts?f=pending': '/workspace/accounts/?f=pending',
    '#/accounts?f=never': '/workspace/accounts/?f=never',
    '#/structure': '/workspace/structure/',
    '#/helpdesk': '/workspace/helpdesk/',
    '#/meetings': '/workspace/meetings/',
    '#/engagement': '/workspace/engagement/',
    '#/outreach': '/workspace/outreach/',
    '#/library': '/workspace/library/',
    '#/documents': '/workspace/documents/',
    '#/messages': '/workspace/messages/',
    '#/content': '/workspace/content/',
    '#/dashboard': '/workspace/dashboard/',
    '#/spotlight-review': '/workspace/spotlight-review/',
    '#/settings': '/workspace/settings/',
    '#/ask': '/workspace/ask/',
    '#/feedback': '/workspace/feedback/',
    '#/leaders': '/workspace/leaders/',
    '#/leadership': '/workspace/leadership/',
    '#/reports': '/workspace/reports/',
    '#/reflinks': '/workspace/reflinks/',
    '#/hq': '/workspace/hq/',
}

HQ_FUNCTION_LABELS = {
    'founder': 'Founder / Executive Command',
    'hofco': 'Head of Field & Country Operations (HOFCO)',
    'secretary': 'Network Administration & Coordination Secretary',
    'admin': 'Director of Administration',
    'programmes': 'Director of Programmes',
    'comms': 'Communications & Visibility',
    'finance': 'Director of Finance',
    'it': 'WDOS IT & Systems Manager',
    'qa': 'WDOS Quality Assurance & Controls Lead',
}

_HQ_SIDEBARS_CACHE = None


def load_hq_sidebars():
    global _HQ_SIDEBARS_CACHE
    if _HQ_SIDEBARS_CACHE is not None:
        return _HQ_SIDEBARS_CACHE
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'assets' / 'hq-sidebars.json',
        Path(settings.BASE_DIR).parent / 'app' / 'assets' / 'hq-sidebars.json',
    ]
    for p in candidates:
        if p.exists():
            try:
                _HQ_SIDEBARS_CACHE = json.loads(p.read_text(encoding='utf-8'))
                return _HQ_SIDEBARS_CACHE
            except Exception:
                pass
    _HQ_SIDEBARS_CACHE = {'sidebars': {}, 'planned': {}}
    return _HQ_SIDEBARS_CACHE


def map_hash_to_url(h):
    if h in HASH_TO_DJANGO_URL:
        return HASH_TO_DJANGO_URL[h]
    if h.startswith('#/planned/'):
        key = h.replace('#/planned/', '').strip('/')
        return f'/workspace/planned/{key}/'
    if h.startswith('#/'):
        rest = h[2:]
        return f'/workspace/{rest}/'
    return '/workspace/'


def build_hq_groups(hq_fn):
    data = load_hq_sidebars()
    fn_items_raw = data.get('sidebars', {}).get(hq_fn or 'founder', [])
    role_items = []
    seen = set()
    for entry in fn_items_raw:
        if isinstance(entry, list) and len(entry) >= 2:
            label, h = entry[0], entry[1]
            url = map_hash_to_url(h)
            key = (label, url)
            if key not in seen:
                seen.add(key)
                role_items.append({'label': label, 'url': url, 'open': True})

    groups = []
    if role_items:
        groups.append({
            'id': 'hq_role',
            'title': HQ_FUNCTION_LABELS.get(hq_fn or 'founder', 'HQ Role Navigation'),
            'items': role_items,
            'default_open': True,
        })

    # Always include the 13 Central Admin groups so every HQ page is reachable
    central_groups = [
        ('hq_cmd', '1. Command & Dashboards', [
            {'label': 'Founder Command Centre', 'url': '/workspace/central/', 'open': True},
            {'label': 'HOFCO Dashboard', 'url': '/workspace/hofco/', 'open': True},
            {'label': 'HQ Role Home', 'url': '/workspace/role-home/', 'open': True},
            {'label': 'Operations Centre', 'url': '/workspace/ops/', 'open': True},
            {'label': 'Network Command', 'url': '/workspace/command/', 'open': True},
            {'label': 'WGMN Command', 'url': '/workspace/network/WGMN/', 'open': True},
            {'label': 'WNNN Command', 'url': '/workspace/network/WNNN/', 'open': True},
        ]),
        ('hq_people', '2. People & Structure', [
            {'label': 'Countries & Units', 'url': '/workspace/organisation/', 'open': True},
            {'label': 'Leadership Structure', 'url': '/workspace/structure/', 'open': True},
            {'label': 'Leader Atlas', 'url': '/workspace/leaders/', 'open': True},
            {'label': 'Continental Leadership', 'url': '/workspace/leadership/', 'open': True},
            {'label': 'Members Directory', 'url': '/workspace/members/', 'open': True},
        ]),
        ('hq_recruit', '3. Recruitment & Activation', [
            {'label': 'HQ Activation & Readiness', 'url': '/workspace/hq-activation/', 'open': True},
            {'label': 'Applications & Screening', 'url': '/workspace/recruitment/', 'open': True},
            {'label': 'Referral Links', 'url': '/workspace/reflinks/', 'open': True},
            {'label': 'Position Mailboxes', 'url': '/workspace/mailboxes/', 'open': True},
            {'label': 'Accounts & Seat Control', 'url': '/workspace/accounts/', 'open': True},
        ]),
        ('hq_ops', '4. Operations & Accountability', [
            {'label': 'Tasks & Follow-Up', 'url': '/workspace/tasks/', 'open': True},
            {'label': 'Meetings', 'url': '/workspace/meetings/', 'open': True},
            {'label': 'Reporting & Compliance', 'url': '/workspace/reporting/', 'open': True},
            {'label': 'Analytics & Exports', 'url': '/workspace/reports/', 'open': True},
            {'label': 'Programmes & Impact', 'url': '/workspace/programmes/', 'open': True},
            {'label': 'HQ Staff Operations', 'url': '/workspace/hq/', 'open': True},
        ]),
        ('hq_engage', '5. Engagement, Safety & Admin', [
            {'label': 'Announcements', 'url': '/workspace/announcements/', 'open': True},
            {'label': 'Messages Inbox', 'url': '/workspace/messages/', 'open': True},
            {'label': 'Volunteer Engagement', 'url': '/workspace/engagement/', 'open': True},
            {'label': 'Spotlight Review', 'url': '/workspace/spotlight-review/', 'open': True},
            {'label': 'Institute Outreach', 'url': '/workspace/outreach/', 'open': True},
            {'label': 'Safeguarding Cases', 'url': '/workspace/cases/', 'open': True},
            {'label': 'Helpdesk & Support', 'url': '/workspace/helpdesk/', 'open': True},
            {'label': 'Message Template Library', 'url': '/workspace/library/', 'open': True},
            {'label': 'Documents Repository', 'url': '/workspace/documents/', 'open': True},
            {'label': 'Content Studio', 'url': '/workspace/content/', 'open': True},
            {'label': 'System Settings', 'url': '/workspace/settings/', 'open': True},
            {'label': 'WDOS Doctor', 'url': '/workspace/doctor/', 'open': True},
            {'label': 'Ask WODDI', 'url': '/workspace/ask/', 'open': True},
            {'label': 'UAT Feedback', 'url': '/workspace/feedback/', 'open': True},
        ]),
    ]
    for gid, title, items in central_groups:
        groups.append({
            'id': gid,
            'title': title,
            'items': items,
            'default_open': not bool(role_items),
        })
    return groups


def build_volunteer_groups(is_leader, is_deputy, gate_is_open):
    raw_sections = [
        ('sb_1', '1. Dashboard', False, [
            {'label': 'Home', 'url': '/workspace/', 'open': True},
            {'label': 'Country Overview', 'url': '/workspace/my/country/', 'leader': True},
            {'label': 'Alerts & Attention', 'url': '/workspace/reporting/dashboard/', 'leader': True},
            {'label': 'Priority Actions', 'url': '/workspace/tasks/'},
            {'label': 'Performance Summary', 'url': '/workspace/reporting/compliance/', 'leader': True},
        ]),
        ('sb_2', '2. My Leadership Structure', True, [
            {'label': 'My Leadership Line', 'url': '/workspace/my/leadership/'},
            {'label': 'State / Regional Leaders', 'url': '/workspace/structure/?level=state_region'},
            {'label': 'LGA / District Leaders', 'url': '/workspace/structure/?level=district_lga'},
            {'label': 'Community Cluster Leaders', 'url': '/workspace/structure/?level=community_cluster'},
            {'label': 'Chapter Leaders', 'url': '/workspace/structure/?level=chapter'},
            {'label': 'Vacant Positions', 'url': '/workspace/structure/?status=vacant'},
            {'label': 'Appointed Leaders', 'url': '/workspace/structure/?appt=appointed'},
            {'label': 'Unverified / Pending', 'url': '/workspace/structure/?appt=pending'},
        ]),
        ('sb_3', '3. Recruitment', False, [
            {'label': 'Referrals & 3-Day Forms', 'url': '/workspace/my/referrals/'},
            {'label': 'Vacancy Referral Links', 'url': '/workspace/my/reflinks/', 'leader': True},
            {'label': 'Candidates & Screening', 'url': '/workspace/recruitment/', 'leader': True},
            {'label': 'Appointment Pending', 'url': '/workspace/structure/?appt=pending', 'leader': True},
        ]),
        ('sb_4', '4. Tasks & Follow-Up', False, [
            {'label': 'My Delegated Portfolio', 'url': '/workspace/?portfolio=1', 'deputy': True, 'open': True},
            {'label': 'Tasks Assigned to Me', 'url': '/workspace/tasks/?scope=mine'},
            {'label': 'Tasks I Assigned', 'url': '/workspace/tasks/?scope=assigned', 'leader': True},
            {'label': 'Overdue Tasks', 'url': '/workspace/tasks/?scope=overdue'},
            {'label': 'Completed Tasks', 'url': '/workspace/tasks/?scope=done'},
            {'label': 'Follow-Up Tracker', 'url': '/workspace/tasks/?scope=followup', 'leader': True},
        ]),
        ('sb_5', '5. Reports', True, [
            {'label': 'Submit Report', 'url': '/workspace/reporting/mine/'},
            {'label': 'Reports from Leaders', 'url': '/workspace/reporting/review/'},
            {'label': 'Reporting Compliance', 'url': '/workspace/reporting/compliance/'},
            {'label': 'Operational Activity Log', 'url': '/workspace/reporting/records/'},
            {'label': 'Reports Archive', 'url': '/workspace/reporting/archive/'},
        ]),
        ('sb_6', '6. Meetings', False, [
            {'label': 'Meetings', 'url': '/workspace/meetings/'},
            {'label': 'Meeting Minutes Report', 'url': '/workspace/reporting/mine/?tpl=meeting_actions', 'leader': True},
        ]),
        ('sb_7', '7. Programmes & Activities', False, [
            {'label': 'Engagement & Calendar', 'url': '/workspace/my/calendar/'},
            {'label': 'Programmes & Events', 'url': '/workspace/programmes/'},
            {'label': 'Field Activities', 'url': '/workspace/activities/'},
            {'label': 'Evidence & Documents', 'url': '/workspace/my/documents/', 'open': True},
        ]),
        ('sb_8', '8. WODDI Institute', False, [
            {'label': 'My Courses & Certificates', 'url': '/workspace/my/learning/', 'open': True},
        ]),
        ('sb_9', '9. Members', False, [
            {'label': 'WGMN Members', 'url': '/workspace/members/?net=WGMN'},
            {'label': 'WNNN Members', 'url': '/workspace/members/?net=WNNN'},
            {'label': 'My Impact', 'url': '/workspace/my/impact/'},
        ]),
        ('sb_10', '10. Communications', False, [
            {'label': 'Announcements', 'url': '/workspace/announcements/'},
            {'label': 'Direct Messages', 'url': '/workspace/messages/'},
            {'label': 'HQ Inspiration Stream', 'url': '/workspace/my/messages/', 'open': True},
        ]),
        ('sb_11', '11. Safeguarding & Escalations', False, [
            {'label': 'File Safeguarding Concern', 'url': '/workspace/my/safeguarding/', 'open': True},
            {'label': 'Issues & Escalations', 'url': '/workspace/reporting/issues/', 'leader': True},
            {'label': 'Confidential Cases', 'url': '/workspace/cases/', 'leader': True},
        ]),
        ('sb_12', '12. Performance', True, [
            {'label': 'Country Scorecard', 'url': '/workspace/my/country/'},
            {'label': 'Personal & Unit Impact', 'url': '/workspace/my/impact/'},
        ]),
        ('sb_13', '13. Documents & Resources', False, [
            {'label': 'Governance Documents', 'url': '/workspace/my/documents/', 'open': True},
            {'label': 'Operational Templates', 'url': '/workspace/my/templates/', 'open': True},
            {'label': 'Code of Conduct', 'url': '/workspace/read/?d=coc', 'open': True},
            {'label': 'Leadership Manual', 'url': '/workspace/read/?d=manual', 'open': True},
        ]),
        ('sb_14', '14. Country Directory', True, [
            {'label': 'Where I Sit & Reporting Line', 'url': '/workspace/my/network/', 'open': True},
            {'label': 'Leadership Directory', 'url': '/workspace/structure/'},
        ]),
        ('sb_15', '15. Help & Support', False, [
            {'label': 'Help & Support Centre', 'url': '/workspace/my/support/', 'open': True},
            {'label': 'Ask WODDI Assistant', 'url': '/workspace/ask/', 'open': True},
            {'label': 'UAT Feedback', 'url': '/workspace/feedback/', 'open': True},
        ]),
        ('sb_16', '16. My Onboarding', True, [
            {'label': '10-Step Leadership Onboarding', 'url': '/onboarding/', 'open': True},
            {'label': 'Onboarding Status', 'url': '/workspace/my/onboarding/', 'open': True},
        ]),
        ('sb_17', '17. My Profile', False, [
            {'label': 'Personal Details', 'url': '/workspace/my/profile/', 'open': True},
            {'label': 'Settings & Security', 'url': '/workspace/my/settings/', 'open': True},
        ]),
    ]

    groups = []
    for gid, title, leader_only, items in raw_sections:
        if leader_only and not is_leader:
            continue
        filtered = []
        for item in items:
            if item.get('leader') and not is_leader:
                continue
            if item.get('deputy') and not is_deputy:
                continue
            item_open = bool(item.get('open')) or gate_is_open
            filtered.append({
                'label': item['label'],
                'url': item['url'],
                'open': item_open,
                'locked': not item_open,
            })
        if filtered:
            groups.append({
                'id': gid,
                'title': title,
                'items': filtered,
                'default_open': gid in ('sb_1', 'sb_16', 'sb_17'),
            })
    return groups


def navigation_context(request):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return {}

    is_hq = user.is_in_hq()
    roles = list(user.get_roles())
    active_seat = roles[0] if roles else None
    is_leader = bool(user.is_leader or roles)
    seat_role = active_seat.role if active_seat else ''
    is_deputy = seat_role.startswith('deputy_') or seat_role.startswith('assistant_')

    hq_fn = request.session.get('wdos_hq_fn') or user.hq_function or ('founder' if is_hq else '')
    gate_is_open = True if is_hq else gate_open(user)

    if is_hq:
        sidebar_groups = build_hq_groups(hq_fn)
        role_display = HQ_FUNCTION_LABELS.get(hq_fn, 'HQ Command')
    else:
        sidebar_groups = build_volunteer_groups(is_leader, is_deputy, gate_is_open)
        role_display = (
            get_role_title(seat_role, user.network)
            if seat_role
            else ('Volunteer Leader' if is_leader else f'{user.network} Community Member')
        )

    return {
        'nav_is_hq': is_hq,
        'nav_hq_fn': hq_fn,
        'nav_hq_fn_choices': list(HQ_FUNCTION_LABELS.items()),
        'nav_is_leader': is_leader,
        'nav_is_deputy': is_deputy,
        'nav_active_seat': active_seat,
        'nav_role_display': role_display,
        'nav_gate_open': gate_is_open,
        'nav_sidebar_groups': sidebar_groups,
    }
