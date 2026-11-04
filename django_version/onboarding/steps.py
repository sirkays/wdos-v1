"""The 10 onboarding steps, taken from supabase migrations 111 + 138."""
from .models import OnboardingProgress

STEPS = [
    dict(code='role', seq=1, num=1, title='Read my role description and authority limits', label='Read my role description and authority limits', detail='Leadership Handbook, section for your position', mode='read', doc='leadership-manual.html', min_seconds=90, required=True),
    dict(code='reporting_line', seq=2, num=2, title='Confirm my reporting line', label='Confirm my reporting line', detail='Who I report to and who reports to me', mode='visit', doc=None, min_seconds=15, required=True),
    dict(code='pack', seq=3, num=3, title='Read the Volunteer Leadership Pack', label='Read the Volunteer Leadership Pack', detail='Templates & Tools and Documents', mode='read', doc='leadership-manual.html', min_seconds=60, required=True),
    dict(code='conduct', seq=4, num=4, title='Acknowledge the Code of Conduct', label='Acknowledge the Code of Conduct', detail='', mode='read', doc='code-of-conduct.html', min_seconds=90, required=True),
    dict(code='safeguarding', seq=5, num=5, title='Acknowledge the safeguarding requirements', label='Acknowledge the safeguarding requirements', detail='', mode='read', doc='volunteer-agreement.html', min_seconds=60, required=True),
    dict(code='confidentiality', seq=6, num=6, title='Acknowledge the confidentiality requirements', label='Acknowledge the confidentiality requirements', detail='', mode='read', doc='volunteer-agreement.html', min_seconds=60, required=True),
    dict(code='coi', seq=7, num=7, title='Complete the Conflict-of-Interest Declaration', label='Complete the Conflict-of-Interest Declaration', detail='State any conflict or confirm none', mode='declare', doc=None, min_seconds=20, required=True),
    dict(code='protocol', seq=8, num=8, title='Read the communication protocol', label='Read the communication protocol', detail='', mode='read', doc='leadership-manual.html', min_seconds=45, required=True),
    dict(code='templates', seq=9, num=9, title='Open the reporting templates', label='Open the reporting templates', detail='', mode='visit', doc=None, min_seconds=20, required=True),
    dict(code='plan', seq=10, num=10, title='Draft my first 30/60/90-day plan', label='Draft my first 30/60/90-day plan', detail='Use the Country Strategy Planning template', mode='visit', doc=None, min_seconds=30, required=True),
]
BY_CODE = {s['code']: s for s in STEPS}

REQUIRED_DOCS = {
    'role': {'title': 'WODDI Volunteer Leadership Manual & TOR', 'subtitle': 'Role description, authority limits & governance structure', 'file': 'leadership-manual.html'},
    'conduct': {'title': 'WODDI Code of Conduct & Ethics Policy', 'subtitle': 'Mandatory conduct standards for all leaders & volunteers', 'file': 'code-of-conduct.html'},
    'safeguarding': {'title': 'Safeguarding, Confidentiality & Volunteer Agreement', 'subtitle': 'Zero-tolerance safeguarding and data protection pledge', 'file': 'volunteer-agreement.html'},
}


def _completed_map(user):
    if not user or not user.is_authenticated:
        return {}
    return {p.step_code: p for p in OnboardingProgress.objects.filter(profile=user)}


def gate_open(user):
    """The workspace gate lifts only when every required onboarding step is finished."""
    if not user or not user.is_authenticated:
        return False
    done = _completed_map(user)
    return all(s['code'] in done for s in STEPS if s['required'])
