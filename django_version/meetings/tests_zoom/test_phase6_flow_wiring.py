from datetime import timedelta
from unittest.mock import MagicMock, patch
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.core.cache import caches
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from core.models import OrgUnit, Profile
from operations.admin import MeetingAdmin
from operations.models import Meeting

from ..models import GuestSession, MeetingCheckin
from ..models_zoom import VideoPlatformSettings, ZoomHostAccount, ZoomMeeting
from ..platform import invalidate_provider_cache
from ..zoom.client import ZoomClient, ZoomError
from .test_phase1_admin_models import ZOOM_TEST_SETTINGS
from .test_phase3_4_5_signatures_ws_webhooks import _unlock_onboarding


@override_settings(**ZOOM_TEST_SETTINGS)
class Phase6FlowWiringTest(TestCase):
    def setUp(self):
        caches['zoom'].clear()
        invalidate_provider_cache()
        self.unit = OrgUnit.objects.create(name='Nigeria', level='country', country_iso='NG')
        self.hq = Profile.objects.create_user(
            email='hq@thewoddi.org',
            password='password123',
            first_name='HQ',
            last_name='Admin',
            hq_function='founder',
            is_staff=True,
            is_superuser=True,
        )
        self.member = Profile.objects.create_user(
            email='member@thewoddi.org',
            password='password123',
            first_name='Member',
            last_name='One',
            org_unit=self.unit,
        )
        for u in (self.hq, self.member):
            _unlock_onboarding(u)

        self.zhost = ZoomHostAccount.objects.create(
            zoom_user_id='zhost-flow',
            email='zhost-flow@thewoddi.org',
            label='Flow Host',
            capacity=300,
            is_active=True,
        )

    def tearDown(self):
        caches['zoom'].clear()
        invalidate_provider_cache()

    @patch('meetings.zoom.provisioning.ZoomClient')
    def test_switch_to_zoom_create_join_guest_lobby_and_end_flow(self, mock_client_cls):
        mock_client = MagicMock(spec=ZoomClient)
        mock_client.create_meeting.return_value = {
            'id': 5544332211,
            'uuid': 'zoom-uuid-flow',
            'password': 'FlowPass12',
        }
        mock_client_cls.return_value = mock_client

        # 1. Switch provider to Zoom
        cfg = VideoPlatformSettings.load()
        cfg.active_provider = 'zoom'
        cfg.save()
        invalidate_provider_cache()

        # 2. Schedule a new meeting via create_view
        self.client.force_login(self.hq)
        now = timezone.now()
        resp = self.client.post(
            reverse('meetings:new'),
            {
                'title': 'Zoom Continental Townhall',
                'agenda': 'Agenda items',
                'org_unit': self.unit.pk,
                'mode': 'virtual',
                'platform': 'zoom',
                'location': '',
                'audience': 'unit',
                'access': 'anyone',
                'starts_at': (now + timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M'),
                'ends_at': (now + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M'),
            },
        )
        m = Meeting.objects.get(title='Zoom Continental Townhall')
        self.assertRedirects(resp, reverse('meetings:detail', args=[m.pk]))
        self.assertEqual(m.platform, 'zoom')
        self.assertEqual(m.location, 'Zoom meeting')
        self.assertTrue(hasattr(m, 'zoom'))
        self.assertEqual(m.zoom.zoom_meeting_id, 5544332211)

        # 3. LiveKit-only endpoints return 400 for Zoom meetings
        self.assertEqual(self.client.get(reverse('meetings:token', args=[m.pk])).status_code, 400)
        self.assertEqual(self.client.post(reverse('meetings:control', args=[m.pk]), {'target': '*'}).status_code, 400)

        # 4. Member joins via join_view -> redirects to meetings:zoom_room
        c_mem = Client()
        c_mem.force_login(self.member)
        r_join = c_mem.post(reverse('meetings:join', args=[m.pk]))
        self.assertRedirects(r_join, reverse('meetings:zoom_room', args=[m.pk]), fetch_redirect_response=False)
        self.assertTrue(MeetingCheckin.objects.filter(meeting=m, profile=self.member).exists())

        # 5. Guest joins via guest link -> wait_view renders guest_wait_zoom.html (WebSocket, no LiveKit)
        c_guest = Client()
        r_gjoin = c_guest.post(
            reverse('meetings:guest_join', args=[m.guest_code]),
            {'name': 'External Partner', 'lang': 'en'},
        )
        self.assertRedirects(r_gjoin, reverse('meetings:guest_wait', args=[m.guest_code]))
        r_gwait = c_guest.get(reverse('meetings:guest_wait', args=[m.guest_code]))
        self.assertEqual(r_gwait.status_code, 200)
        self.assertContains(r_gwait, 'realtime/ws.js')
        self.assertNotContains(r_gwait, 'livekit-client')

        # Guest LiveKit token endpoints return 400 for Zoom meetings
        self.assertEqual(c_guest.get(reverse('meetings:guest_token', args=[m.guest_code])).status_code, 400)
        self.assertEqual(c_guest.get(reverse('meetings:guest_lobby_token', args=[m.guest_code])).status_code, 400)

        # 6. Host admits guest -> guest wait redirects to guest_zoom_room
        g = GuestSession.objects.get(meeting=m, name='External Partner')
        self.client.post(reverse('meetings:guest_action', args=[m.pk, g.pk, 'admit']))
        g.refresh_from_db()
        self.assertEqual(g.status, 'admitted')
        r_groom = c_guest.get(reverse('meetings:guest_room', args=[m.guest_code]))
        self.assertRedirects(
            r_groom, reverse('meetings:guest_zoom_room', args=[m.guest_code]), fetch_redirect_response=False
        )

        # 7. Host ends meeting -> calls end_zoom_meeting and marks completed
        r_end = self.client.post(reverse('meetings:end', args=[m.pk]))
        self.assertEqual(r_end.status_code, 302)
        m.refresh_from_db()
        m.zoom.refresh_from_db()
        self.assertEqual(m.status, 'completed')
        self.assertFalse(m.zoom.is_live)
        self.assertTrue(mock_client.end_meeting.called)

    @patch('meetings.zoom.provisioning.ZoomClient')
    def test_create_view_rollback_and_fallback_to_livekit_on_zoom_error(self, mock_client_cls):
        mock_client = MagicMock(spec=ZoomClient)
        mock_client.create_meeting.side_effect = ZoomError('Zoom API 503 Unavailable')
        mock_client_cls.return_value = mock_client

        cfg = VideoPlatformSettings.load()
        cfg.active_provider = 'zoom'
        cfg.fallback_to_livekit = False
        cfg.save()
        invalidate_provider_cache()

        self.client.force_login(self.hq)
        now = timezone.now()
        post_data = {
            'title': 'Failing Zoom Meeting',
            'agenda': 'Agenda',
            'org_unit': self.unit.pk,
            'mode': 'virtual',
            'platform': 'zoom',
            'location': '',
            'audience': 'unit',
            'starts_at': (now + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M'),
            'ends_at': (now + timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'),
        }

        # With fallback_to_livekit=False -> rolls back, meeting not created, form error shown
        r1 = self.client.post(reverse('meetings:new'), post_data)
        self.assertEqual(r1.status_code, 200)
        self.assertContains(r1, 'Could not provision Zoom meeting')
        self.assertFalse(Meeting.objects.filter(title='Failing Zoom Meeting').exists())

        # With fallback_to_livekit=True -> falls back to platform='woddi'
        cfg.fallback_to_livekit = True
        cfg.save()
        r2 = self.client.post(reverse('meetings:new'), post_data)
        m = Meeting.objects.get(title='Failing Zoom Meeting')
        self.assertRedirects(r2, reverse('meetings:detail', args=[m.pk]))
        self.assertEqual(m.platform, 'woddi')
        self.assertEqual(m.location, 'WODDI Room')

    def test_legacy_external_zoom_link_still_redirects_to_location(self):
        legacy = Meeting.objects.create(
            title='Legacy External Link',
            org_unit=self.unit,
            organiser=self.hq,
            mode='virtual',
            platform='zoom',
            location='https://zoom.us/j/123456789',
            audience='unit',
        )
        self.client.force_login(self.member)
        r = self.client.post(reverse('meetings:join', args=[legacy.pk]))
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r['Location'], 'https://zoom.us/j/123456789')

    @patch('meetings.zoom.provisioning.ZoomClient')
    def test_meeting_admin_move_to_zoom_and_move_to_livekit(self, mock_client_cls):
        mock_client = MagicMock(spec=ZoomClient)
        mock_client.create_meeting.return_value = {'id': 6677889900, 'uuid': 'u-move', 'password': 'MovePass10'}
        mock_client_cls.return_value = mock_client

        future_m = Meeting.objects.create(
            title='Future Movable Meeting',
            org_unit=self.unit,
            organiser=self.hq,
            mode='virtual',
            platform='woddi',
            location='WODDI Room',
            status='scheduled',
            starts_at=timezone.now() + timedelta(hours=3),
            ends_at=timezone.now() + timedelta(hours=4),
        )

        req = RequestFactory().post('/admin/operations/meeting/')
        req.user = self.hq
        req.session = 'session'
        req._messages = FallbackStorage(req)
        adm = MeetingAdmin(Meeting, AdminSite())

        # Move to Zoom
        adm.move_to_zoom(req, Meeting.objects.filter(pk=future_m.pk))
        future_m.refresh_from_db()
        self.assertEqual(future_m.platform, 'zoom')
        self.assertTrue(ZoomMeeting.objects.filter(meeting=future_m).exists())

        # Move back to LiveKit
        adm.move_to_livekit(req, Meeting.objects.filter(pk=future_m.pk))
        future_m.refresh_from_db()
        self.assertEqual(future_m.platform, 'woddi')
        self.assertFalse(ZoomMeeting.objects.filter(meeting=future_m).exists())
