from django.test import TestCase, Client
from core.models import OrgUnit, Profile, OrgLevel, RoleCode, NetworkCode, MemberStatus


class WDOSTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.hq = OrgUnit.objects.create(
            name="WODDI HQ Test",
            level=OrgLevel.HEADQUARTERS,
            country_iso="NG"
        )
        self.admin_user = Profile.objects.create_superuser(
            email="testadmin@thewoddi.org",
            password="testpassword123",
            first_name="Test",
            last_name="Admin"
        )

    def test_org_unit_hierarchy(self):
        child = OrgUnit.objects.create(
            name="Nigeria Test",
            parent=self.hq,
            level=OrgLevel.COUNTRY,
            country_iso="NG"
        )
        sub_ids = self.hq.subtree_ids()
        self.assertIn(self.hq.id, sub_ids)
        self.assertIn(child.id, sub_ids)

    def test_welcome_page(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Good Mother Network', response.content.decode('utf-8'))
        self.assertIn('Next-Gen Nurturers', response.content.decode('utf-8'))

    def test_login_flow(self):
        # 1. GET login page
        res = self.client.get('/accounts/login/')
        self.assertEqual(res.status_code, 200)

        # 2. POST valid login
        res_post = self.client.post('/accounts/login/', {
            'email': 'testadmin@thewoddi.org',
            'password': 'testpassword123',
            'remember': 'on',
        })
        self.assertEqual(res_post.status_code, 302)
        self.assertEqual(res_post.headers.get('Location'), '/workspace/')

    def test_register_page(self):
        response = self.client.get('/accounts/register/?network=WGMN')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Join the WODDI Movement', response.content.decode('utf-8'))
