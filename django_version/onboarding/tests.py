from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from core.models import OrgUnit, OrgLevel, RoleAssignment, RoleCode, MemberStatus, AuditLog
from members.models import Application, Referral, PositionMailbox
from activation.models import CandidateActivation
from onboarding.models import OnboardingProgress
from onboarding.steps import STEPS
from operations.models import (
    Task, TaskStatus, LeaderReport, ReportTemplate, Course, CourseEnrollment,
    EngagementItem, CaseFile, HelpdeskTicket, MessageTemplate, AutomationRule,
)


def _complete_all_onboarding_steps(user):
    for s in STEPS:
        OnboardingProgress.objects.get_or_create(profile=user, step_code=s['code'])


class OnboardingFlow(TestCase):
    def setUp(self):
        U = get_user_model()
        self.u = U.objects.create_user(email='a@b.com', password='pw12345678')
        self.client.force_login(self.u)

    def test_page_and_enforcement(self):
        r = self.client.get(reverse('onboarding:start'))
        self.assertContains(r, 'Step 1 of 10')
        # Un-onboarded users cannot access workspace pages — redirected to /onboarding/
        for locked_url in [
            reverse('onboarding:dashboard'),
            reverse('onboarding:tasks'),
            reverse('onboarding:activities'),
            reverse('onboarding:structure'),
            reverse('onboarding:members'),
            reverse('onboarding:ops'),
        ]:
            self.assertRedirects(self.client.get(locked_url), reverse('onboarding:start'))
        r = self.client.post(reverse('onboarding:complete', args=['role']), {'seconds': 1, 'reached_end': '0'})
        self.assertEqual(r.status_code, 400)
        r = self.client.post(reverse('onboarding:complete', args=['role']), {'seconds': 60, 'reached_end': '1'})
        self.assertEqual(r.status_code, 200)
        self.assertContains(self.client.get(reverse('onboarding:start')), 'Step 2 of 10')
        self.assertEqual(self.client.get(reverse('onboarding:doc', args=['role'])).status_code, 200)


class PublicDoorsTests(TestCase):
    def setUp(self):
        self.hq_unit = OrgUnit.objects.create(name='WODDI Global HQ', level=OrgLevel.HEADQUARTERS, country_iso='NG')
        self.ng_unit = OrgUnit.objects.create(name='WODDI Nigeria', level=OrgLevel.COUNTRY, parent=self.hq_unit, country_iso='NG')

    def test_apply_age_band_rule_18_29_assigns_wnnn_and_30_plus_assigns_wgmn(self):
        # 18-29 -> WNNN
        r1 = self.client.post('/apply/', {
            'first_name': 'Zainab', 'last_name': 'Bello', 'email': 'zainab@example.org',
            'phone': '+2348011112222', 'country': 'Nigeria', 'age_band': '18-29',
            'motivation': 'I want to mentor young women in my university community across Nigeria.',
        })
        self.assertEqual(r1.status_code, 200)
        app1 = Application.objects.get(email='zainab@example.org')
        self.assertEqual(app1.network, 'WNNN')

        # 30+ -> WGMN
        r2 = self.client.post('/apply/', {
            'first_name': 'Ngozi', 'last_name': 'Okonkwo', 'email': 'ngozi@example.org',
            'phone': '+2348033334444', 'country': 'Nigeria', 'age_band': '30-44',
            'motivation': 'I have 12 years of maternal health leadership experience in Lagos State.',
        })
        self.assertEqual(r2.status_code, 200)
        app2 = Application.objects.get(email='ngozi@example.org')
        self.assertEqual(app2.network, 'WGMN')

    def test_3day_referral_join_wgmn_and_wnnn(self):
        r = self.client.post('/join/WGMN/', {
            'first_name': 'Amina', 'last_name': 'Yusuf', 'email': 'amina.ref@example.org',
            'phone': '+2348055556666', 'country': 'Nigeria', 'state': 'Kano',
            'referrer_name': 'Dr. Founder', 'role_considered': 'state_coordinator',
            'motivation': 'Ready to lead WGMN in Kano State with integrity and dedication.',
            'password': 'Password123!',
        })
        self.assertEqual(r.status_code, 302)
        act = CandidateActivation.objects.get(profile__email='amina.ref@example.org')
        self.assertEqual(act.route, 'ref3')
        self.assertEqual(act.network, 'WGMN')
        self.assertEqual(act.total_days, 3)

    def test_other_public_doors_render(self):
        for url in ['/candidate/', '/r/WGMN/', '/volunteer/', '/wgmn/', '/wnnn/', '/claim/', '/id/']:
            resp = self.client.get(url)
            self.assertIn(resp.status_code, (200, 302), f"Failed on {url}")


class HqCommandAndDashboardsTests(TestCase):
    def setUp(self):
        U = get_user_model()
        self.hq_unit = OrgUnit.objects.create(name='WODDI Global HQ', level=OrgLevel.HEADQUARTERS, country_iso='NG')
        self.ng_unit = OrgUnit.objects.create(name='WODDI Nigeria', level=OrgLevel.COUNTRY, parent=self.hq_unit, country_iso='NG')
        self.founder = U.objects.create_user(
            email='founder@woddi.org', password='pw12345678',
            first_name='Executive', last_name='Founder', hq_function='founder', is_staff=True, org_unit=self.hq_unit
        )
        self.leader = U.objects.create_user(
            email='leader@woddi.org', password='pw12345678',
            first_name='Grace', last_name='Okafor', is_leader=True, network='WGMN', country='Nigeria', org_unit=self.ng_unit
        )
        for u in (self.founder, self.leader):
            _complete_all_onboarding_steps(u)
        AutomationRule.objects.create(code='inactive_14d', name='14-Day Inactivity Follow-up', is_autopilot=True, is_active=True)
        self.client.force_login(self.founder)

    def test_all_hq_dashboards_and_actions(self):
        for url in [
            reverse('onboarding:central'),
            reverse('onboarding:hofco'),
            reverse('onboarding:role_home'),
            reverse('onboarding:network_hq', args=['WGMN']),
            reverse('onboarding:network_hq', args=['WNNN']),
            reverse('onboarding:command'),
            reverse('onboarding:ops'),
            reverse('onboarding:ops_tab', args=['leaders']),
            reverse('onboarding:ops_tab', args=['autopilot']),
            reverse('onboarding:hq_activation'),
            reverse('onboarding:mailboxes'),
            reverse('onboarding:accounts_manage'),
            reverse('onboarding:view_as', args=[self.leader.id]),
            reverse('onboarding:hq_staff'),
        ]:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200, f"Failed GET {url}")

        # CSV export on ops
        csv_resp = self.client.get(reverse('onboarding:ops') + '?export=csv')
        self.assertEqual(csv_resp.status_code, 200)
        self.assertEqual(csv_resp['Content-Type'], 'text/csv')

        # Bulk message & task from ops
        self.client.post(reverse('onboarding:ops'), {
            'action': 'ops_send_message', 'target_net': 'all', 'subject': 'HQ Directive', 'body': 'Welcome all leaders.'
        })
        self.client.post(reverse('onboarding:ops'), {
            'action': 'ops_assign_task', 'target_net': 'WGMN', 'title': 'Submit Q4 Plan', 'priority': 'high'
        })
        self.assertTrue(Task.objects.filter(title='Submit Q4 Plan').exists())

        # Sidebar groups are all closed by default, and base URL redirects onboarded users to home screen
        home_resp = self.client.get(reverse('onboarding:dashboard'))
        self.assertEqual(home_resp.status_code, 200)
        self.assertNotContains(home_resp, '<details class="sb-group" open>')
        self.assertRedirects(self.client.get('/'), reverse('onboarding:dashboard'))
        self.assertRedirects(self.client.get(reverse('accounts:status')), reverse('onboarding:dashboard'))


class LeaderHomeAndModulesTests(TestCase):
    def setUp(self):
        U = get_user_model()
        self.hq_unit = OrgUnit.objects.create(name='WODDI Global HQ', level=OrgLevel.HEADQUARTERS, country_iso='NG')
        self.ng_unit = OrgUnit.objects.create(name='WODDI Nigeria', level=OrgLevel.COUNTRY, parent=self.hq_unit, country_iso='NG')
        self.leader = U.objects.create_user(
            email='crep@woddi.org', password='pw12345678',
            first_name='Funke', last_name='Adeyemi', is_leader=True, network='WGMN',
            country='Nigeria', org_unit=self.ng_unit, status=MemberStatus.ACTIVATED
        )
        _complete_all_onboarding_steps(self.leader)
        self.seat = RoleAssignment.objects.create(
            profile=self.leader, role=RoleCode.COUNTRY_REP, org_unit=self.ng_unit, appointment_status='appointed'
        )
        self.mbox = PositionMailbox.objects.create(
            position_code='NG-CREP-WGMN', email_address='nigeria.wgmn@woddi.org',
            display_name='Nigeria Country Rep', org_unit=self.ng_unit, holder=self.leader,
            password_plain='SecretMail#26', is_unlocked=True
        )
        self.course = Course.objects.create(code='LDR-101', title='WODDI Governance Foundations', is_active=True)
        self.client.force_login(self.leader)

    def test_leader_home_appointment_acceptance_mailbox_reveal_and_subtabs(self):
        # Accept appointment
        r = self.client.post(reverse('onboarding:leader_home'), {'action': 'accept_appointment'})
        self.assertEqual(r.status_code, 302)
        self.seat.refresh_from_db()
        self.assertIsNotNone(self.seat.accepted_at)

        # Reveal mailbox password (audited)
        r_mbox = self.client.post(reverse('onboarding:reveal_mailbox'), {'mailbox_id': str(self.mbox.id)})
        self.assertEqual(r_mbox.status_code, 302)
        self.mbox.refresh_from_db()
        self.assertEqual(self.mbox.reveal_count, 1)
        self.assertTrue(AuditLog.objects.filter(action='mailbox.reveal_password').exists())

        # Profile HQ-managed lock preserves official name for seated leader
        self.client.post(reverse('onboarding:my_tab', args=['profile']), {
            'action': 'update_profile', 'first_name': 'AttemptedChange', 'phone': '+2348099990000', 'city': 'Abuja'
        })
        self.leader.refresh_from_db()
        self.assertEqual(self.leader.first_name, 'Funke')
        self.assertEqual(self.leader.city, 'Abuja')

        # Subtabs render cleanly
        for sub in ['home', 'messages', 'profile', 'leadership', 'onboarding', 'learning', 'referrals', 'impact', 'documents', 'templates', 'calendar', 'support', 'safeguarding', 'settings']:
            resp = self.client.get(reverse('onboarding:my_tab', args=[sub]))
            self.assertEqual(resp.status_code, 200, f"Failed subtab {sub}")

    def test_all_operational_and_governance_modules(self):
        for url in [
            reverse('onboarding:organisation'),
            reverse('onboarding:country_hq'),
            reverse('onboarding:structure'),
            reverse('onboarding:leaders_atlas'),
            reverse('onboarding:members'),
            reverse('onboarding:member_detail', args=[self.leader.id]),
            reverse('onboarding:recruitment'),
            reverse('onboarding:tasks'),
            reverse('onboarding:reporting'),
            reverse('onboarding:reports_analytics'),
            reverse('onboarding:programmes'),
            reverse('onboarding:announcements'),
            reverse('onboarding:messages'),
            reverse('onboarding:cases'),
            reverse('onboarding:helpdesk'),
            reverse('onboarding:library'),
            reverse('onboarding:documents'),
            reverse('onboarding:engagement'),
            reverse('onboarding:doctor'),
            reverse('onboarding:ask'),
            reverse('onboarding:uat_feedback'),
        ]:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200, f"Failed module GET {url}")

        # Submit a Nil Report in Reporting Centre
        r_rep = self.client.post(reverse('onboarding:reporting'), {
            'action': 'submit_report', 'title': 'October Nil Report', 'period_label': '2026-10',
            'is_nil_report': '1', 'nil_reason': 'National public holidays', 'status': 'submitted'
        })
        self.assertEqual(r_rep.status_code, 302)
        self.assertTrue(LeaderReport.objects.filter(is_nil=True).exists())
