from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class OnboardingFlow(TestCase):
    def setUp(self):
        U = get_user_model()
        self.u = U.objects.create_user(email='a@b.com', password='pw12345678')
        self.client.force_login(self.u)

    def test_page_and_enforcement(self):
        r = self.client.get(reverse('onboarding:start'))
        self.assertContains(r, 'Step 1 of 10')
        r = self.client.post(reverse('onboarding:complete', args=['role']), {'seconds': 1, 'reached_end': '0'})
        self.assertEqual(r.status_code, 400)
        r = self.client.post(reverse('onboarding:complete', args=['role']), {'seconds': 60, 'reached_end': '1'})
        self.assertEqual(r.status_code, 200)
        self.assertContains(self.client.get(reverse('onboarding:start')), 'Step 2 of 10')
        self.assertEqual(self.client.get(reverse('onboarding:doc', args=['role'])).status_code, 200)
