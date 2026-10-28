from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from core.models import OrgUnit, Profile
from onboarding.models import OnboardingProgress
from onboarding.steps import STEPS
from operations.models import Meeting

class T(TestCase):
    def test_form_shows_and_saves_guest_access(self):
        unit = OrgUnit.objects.create(level='country', name='Nigeria', country_iso='NG')
        hq = Profile.objects.create_user(email='hq@x.org', password='pw12345678', first_name='H', last_name='Q', hq_function='founder')
        for s in STEPS: OnboardingProgress.objects.create(profile=hq, step_code=s['code'])
        self.client.force_login(hq)
        page = self.client.get(reverse('meetings:new'))
        self.assertContains(page, 'Anyone with the Link')
        self.assertContains(page, 'name="guest_auto_admit"')
        now = timezone.now()
        r = self.client.post(reverse('meetings:new'), {'title': 'Open call', 'agenda': '', 'org_unit': unit.pk, 'mode': 'virtual', 'platform': 'woddi', 'location': '',
            'audience': 'unit', 'access': 'anyone', 'guest_auto_admit': 'on',
            'starts_at': (now + timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M'), 'ends_at': (now + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')})
        m = Meeting.objects.get(title='Open call')
        self.assertEqual((m.access, m.guest_auto_admit, bool(m.guest_code)), ('anyone', True, True))
        self.assertContains(self.client.get(reverse('meetings:detail', args=[m.pk])), '/join/' + m.guest_code + '/')
