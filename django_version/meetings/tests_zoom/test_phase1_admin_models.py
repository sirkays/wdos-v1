from cryptography.fernet import Fernet
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone

from core.models import AuditLog, OrgUnit, Profile
from operations.models import Meeting

from ..admin import VideoPlatformSettingsAdmin, VideoPlatformSettingsForm
from ..models_zoom import VideoPlatformSettings, ZoomHostAccount, ZoomMeeting
from ..platform import active_provider, invalidate_provider_cache

TEST_FERNET_KEY = Fernet.generate_key().decode('utf-8')
ZOOM_TEST_SETTINGS = {
    'ZOOM_ACCOUNT_ID': 'acct_test_123',
    'ZOOM_S2S_CLIENT_ID': 's2s_id_123',
    'ZOOM_S2S_CLIENT_SECRET': 's2s_secret_123',
    'ZOOM_SDK_KEY': 'sdk_key_123',
    'ZOOM_SDK_SECRET': 'sdk_secret_123456789012345678901234567890',
    'ZOOM_WEBHOOK_SECRET_TOKEN': 'wh_secret_123',
    'ZOOM_FIELD_ENCRYPTION_KEY': TEST_FERNET_KEY,
}


class Phase1AdminAndModelsTest(TestCase):
    def setUp(self):
        invalidate_provider_cache()
        self.admin_user = Profile.objects.create_user(
            email='super@thewoddi.org',
            password='password123',
            first_name='Super',
            last_name='Admin',
            is_staff=True,
            is_superuser=True,
        )
        self.unit = OrgUnit.objects.create(name='HQ Unit', level='hq')

    def tearDown(self):
        invalidate_provider_cache()

    def test_singleton_and_active_provider_cache(self):
        s1 = VideoPlatformSettings.load()
        self.assertEqual(s1.pk, 1)
        self.assertEqual(active_provider(), 'livekit')

        s2 = VideoPlatformSettings(active_provider='zoom')
        s2.save()
        self.assertEqual(s2.pk, 1)
        self.assertEqual(VideoPlatformSettings.objects.count(), 1)
        # Still cached until invalidated
        self.assertEqual(active_provider(), 'livekit')
        invalidate_provider_cache()
        self.assertEqual(active_provider(), 'zoom')

    @override_settings(ZOOM_ACCOUNT_ID='', ZOOM_SDK_KEY='')
    def test_admin_form_rejects_zoom_when_env_vars_missing(self):
        ZoomHostAccount.objects.create(
            zoom_user_id='u1', email='host1@thewoddi.org', label='Host 1', capacity=300, is_active=True
        )
        form = VideoPlatformSettingsForm(
            data={
                'active_provider': 'zoom',
                'fallback_to_livekit': False,
                'zoom_waiting_room_mode': 'off',
                'zoom_join_before_host': True,
                'zoom_jbh_minutes': 15,
                'zoom_auto_recording': 'none',
                'zoom_required_capacity': 300,
                'zoom_auto_cohost_managers': True,
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn('missing', str(form.errors).lower())

    @override_settings(**ZOOM_TEST_SETTINGS)
    def test_admin_form_rejects_zoom_when_no_active_host(self):
        form = VideoPlatformSettingsForm(
            data={
                'active_provider': 'zoom',
                'fallback_to_livekit': False,
                'zoom_waiting_room_mode': 'off',
                'zoom_join_before_host': True,
                'zoom_jbh_minutes': 15,
                'zoom_auto_recording': 'none',
                'zoom_required_capacity': 300,
                'zoom_auto_cohost_managers': True,
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn('zoomhostaccount', str(form.errors).lower())

    @override_settings(**ZOOM_TEST_SETTINGS)
    def test_admin_save_writes_audit_log_and_invalidates_cache(self):
        ZoomHostAccount.objects.create(
            zoom_user_id='u1', email='host1@thewoddi.org', label='Host 1', capacity=300, is_active=True
        )
        cfg = VideoPlatformSettings.load()
        self.assertEqual(active_provider(), 'livekit')

        form = VideoPlatformSettingsForm(
            instance=cfg,
            data={
                'active_provider': 'zoom',
                'fallback_to_livekit': True,
                'zoom_waiting_room_mode': 'off',
                'zoom_join_before_host': True,
                'zoom_jbh_minutes': 15,
                'zoom_auto_recording': 'none',
                'zoom_required_capacity': 300,
                'zoom_auto_cohost_managers': True,
            },
        )
        self.assertTrue(form.is_valid(), form.errors)
        obj = form.save(commit=False)

        req = RequestFactory().post('/admin/meetings/videoplatformsettings/1/change/')
        req.user = self.admin_user
        adm = VideoPlatformSettingsAdmin(VideoPlatformSettings, AdminSite())
        adm.save_model(req, obj, form, change=True)

        self.assertEqual(active_provider(), 'zoom')
        log = AuditLog.objects.filter(action='video_platform_settings_updated').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.new_values.get('active_provider'), 'zoom')

    @override_settings(**ZOOM_TEST_SETTINGS)
    def test_passcode_encryption_roundtrip(self):
        host = ZoomHostAccount.objects.create(
            zoom_user_id='u1', email='host1@thewoddi.org', label='Host 1', capacity=300
        )
        m = Meeting.objects.create(
            title='Encrypted Passcode Test',
            org_unit=self.unit,
            organiser=self.admin_user,
            platform='zoom',
            starts_at=timezone.now(),
        )
        zm = ZoomMeeting(meeting=m, host_account=host, zoom_meeting_id=9876543210, meeting_type=2)
        zm.set_passcode('Secr3tPass')
        zm.save()

        zm.refresh_from_db()
        self.assertNotEqual(zm.passcode_enc, 'Secr3tPass')
        self.assertEqual(zm.get_passcode(), 'Secr3tPass')
