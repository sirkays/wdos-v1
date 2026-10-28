from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from . import pack


class ActivationFlow(TestCase):
    def setUp(self):
        self.u = get_user_model().objects.create_user(email='c@d.com', password='pw12345678')
        self.client.force_login(self.u)

    def post(self, name, data, *args):
        return self.client.post(reverse(name, args=args), data, content_type='application/json')

    def test_three_days_then_assessment_and_gate(self):
        self.assertContains(self.client.get(reverse('activation:home')), 'Day 1 of 3')
        self.assertRedirects(self.client.get('/onboarding/'), reverse('activation:home'))
        for d in pack.days_for('ref3'):
            day = d['day']
            self.assertEqual(self.post('activation:complete', {}, day).status_code, 400)
            body = {'answers': {q['key']: 'ok' for q in d['questions']}, 'acks': list(range(len(d['acks']))), 'reached_end': True, 'seconds': 99}
            self.assertEqual(self.post('activation:save', body, day).status_code, 200)
            self.assertEqual(self.post('activation:complete', {}, day).status_code, 200)
        self.assertContains(self.client.get(reverse('activation:home')), 'Readiness Assessment')
        self.assertEqual(self.post('activation:assessment', {'1': 'x'}).status_code, 400)
        full = {str(q['seq']): 'answer' for q in pack.load()['questions']}
        self.assertEqual(self.post('activation:assessment', full).status_code, 200)
        self.assertContains(self.client.get(reverse('activation:home')), 'not selection or appointment')
