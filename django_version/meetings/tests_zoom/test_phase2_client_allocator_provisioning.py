from datetime import timedelta
from unittest.mock import MagicMock
from django.core.cache import caches
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import OrgUnit, Profile
from operations.models import Meeting

from ..models_zoom import VideoPlatformSettings, ZoomHostAccount, ZoomMeeting, ZoomWebhookEvent
from ..zoom.allocator import allocate_host
from ..zoom.client import ZoomAllocationError, ZoomAuthError, ZoomClient, ZoomError, ZoomNotFound, ZoomRateLimited
from ..zoom.provisioning import create_zoom_meeting, delete_zoom_meeting, end_zoom_meeting, update_zoom_meeting
from ..zoom.zak import get_host_zak
from .test_phase1_admin_models import ZOOM_TEST_SETTINGS


def _mock_response(status_code=200, json_data=None, headers=None, content=b'{"ok":true}'):
    resp = MagicMock()
    resp.status_code = status_code
    resp.headers = headers or {'x-zm-trackingid': 'trk-123'}
    resp.content = content if json_data is None and status_code != 204 else (b'' if status_code == 204 else b'{}')
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


@override_settings(**ZOOM_TEST_SETTINGS)
class Phase2ClientAllocatorProvisioningTest(TestCase):
    def setUp(self):
        caches['zoom'].clear()
        self.user = Profile.objects.create_user(
            email='organiser@thewoddi.org',
            password='password123',
            first_name='Grace',
            last_name='Okafor',
            is_staff=True,
            is_superuser=True,
        )
        self.unit = OrgUnit.objects.create(name='Nigeria Chapter', level='country')

    def tearDown(self):
        caches['zoom'].clear()

    def test_client_s2s_token_caching_and_401_refresh(self):
        session = MagicMock()
        session.post.side_effect = [
            _mock_response(200, {'access_token': 'tok-1', 'expires_in': 3600}),
            _mock_response(200, {'access_token': 'tok-2', 'expires_in': 3600}),
        ]
        session.request.side_effect = [
            _mock_response(200, {'id': 'u1', 'type': 2}),
            _mock_response(401, {'message': 'Invalid access token'}),
            _mock_response(200, {'id': 'u1', 'type': 2}),
        ]
        client = ZoomClient(session=session, sleep_fn=lambda _: None)

        # First call fetches tok-1
        res1 = client.get_user('u1')
        self.assertEqual(res1['id'], 'u1')
        self.assertEqual(session.post.call_count, 1)

        # Second call gets 401 -> refreshes token -> retries with tok-2
        res2 = client.get_user('u1')
        self.assertEqual(res2['id'], 'u1')
        self.assertEqual(session.post.call_count, 2)

    def test_client_429_retries_and_honours_retry_after(self):
        sleeps = []
        session = MagicMock()
        session.post.return_value = _mock_response(200, {'access_token': 'tok-1', 'expires_in': 3600})
        session.request.side_effect = [
            _mock_response(429, {'message': 'Rate limit'}, headers={'Retry-After': '2'}),
            _mock_response(429, {'message': 'Rate limit'}, headers={'Retry-After': '1'}),
            _mock_response(200, {'id': 'u1'}),
        ]
        client = ZoomClient(session=session, sleep_fn=lambda s: sleeps.append(s))
        data = client.get_user('u1')
        self.assertEqual(data['id'], 'u1')
        self.assertEqual(sleeps, [2.0, 1.0])

        # Exhausting all 3 attempts raises ZoomRateLimited
        session.request.side_effect = [
            _mock_response(429, {'message': 'Rate limit'}),
            _mock_response(429, {'message': 'Rate limit'}),
            _mock_response(429, {'message': 'Rate limit'}),
        ]
        with self.assertRaises(ZoomRateLimited):
            client.get_user('u1')

    def test_allocator_picks_smallest_eligible_capacity_and_prevents_overlap(self):
        h100 = ZoomHostAccount.objects.create(
            zoom_user_id='h100', email='h100@thewoddi.org', label='Pro 100', capacity=100, is_active=True
        )
        h300 = ZoomHostAccount.objects.create(
            zoom_user_id='h300', email='h300@thewoddi.org', label='Biz 300', capacity=300, is_active=True
        )
        h500 = ZoomHostAccount.objects.create(
            zoom_user_id='h500', email='h500@thewoddi.org', label='Large 500', capacity=500, is_active=True
        )

        now = timezone.now()
        start1 = now + timedelta(hours=2)
        end1 = start1 + timedelta(hours=1)

        # Requires 300 capacity -> skips h100, picks h300 (smallest >= 300)
        picked = allocate_host(starts_at=start1, ends_at=end1, capacity=300)
        self.assertEqual(picked.pk, h300.pk)

        # Book h300 for [start1 - 15m, end1 + 30m]
        m1 = Meeting.objects.create(
            title='M1', org_unit=self.unit, organiser=self.user, platform='zoom', starts_at=start1, ends_at=end1
        )
        ZoomMeeting.objects.create(
            meeting=m1,
            host_account=h300,
            zoom_meeting_id=1110001,
            meeting_type=2,
            passcode_enc='enc',
            occupies_from=start1 - timedelta(minutes=15),
            occupies_until=end1 + timedelta(minutes=30),
        )

        # Overlapping meeting requiring 300 capacity now picks h500
        picked2 = allocate_host(starts_at=start1 + timedelta(minutes=15), ends_at=end1, capacity=300)
        self.assertEqual(picked2.pk, h500.pk)

        # Book h500 as well -> next overlapping 300-cap allocation raises ZoomAllocationError
        m2 = Meeting.objects.create(
            title='M2', org_unit=self.unit, organiser=self.user, platform='zoom', starts_at=start1, ends_at=end1
        )
        ZoomMeeting.objects.create(
            meeting=m2,
            host_account=h500,
            zoom_meeting_id=1110002,
            meeting_type=2,
            passcode_enc='enc',
            occupies_from=start1 - timedelta(minutes=15),
            occupies_until=end1 + timedelta(minutes=30),
        )
        with self.assertRaises(ZoomAllocationError):
            allocate_host(starts_at=start1 + timedelta(minutes=10), ends_at=end1, capacity=300)

        # Non-overlapping window (3 hours later) succeeds on h300 again
        later_start = end1 + timedelta(hours=3)
        later_end = later_start + timedelta(hours=1)
        picked3 = allocate_host(starts_at=later_start, ends_at=later_end, capacity=300)
        self.assertEqual(picked3.pk, h300.pk)

    def test_provisioning_create_update_end_delete_and_reconcile(self):
        host = ZoomHostAccount.objects.create(
            zoom_user_id='host-main', email='host@thewoddi.org', label='Main Host', capacity=300, is_active=True
        )
        cfg = VideoPlatformSettings.load()
        cfg.zoom_waiting_room_mode = 'everyone'
        cfg.save()

        start = timezone.now() + timedelta(hours=1)
        end = start + timedelta(minutes=45)
        m = Meeting.objects.create(
            title='Continental Strategy Sync',
            agenda='Quarterly review',
            org_unit=self.unit,
            organiser=self.user,
            platform='zoom',
            starts_at=start,
            ends_at=end,
            mute_on_entry=True,
        )

        mock_client = MagicMock(spec=ZoomClient)
        mock_client.create_meeting.return_value = {
            'id': 8899001122,
            'uuid': 'uuid-abc-123',
            'password': 'AbCdEf1234',
        }

        zm = create_zoom_meeting(m, client=mock_client)
        self.assertEqual(zm.zoom_meeting_id, 8899001122)
        self.assertEqual(zm.host_account, host)
        self.assertEqual(zm.meeting_type, 2)
        self.assertEqual(zm.get_passcode(), 'AbCdEf1234')

        # Verify waiting_room_options sent when mode=='everyone'
        sent_payload = mock_client.create_meeting.call_args[0][1]
        self.assertTrue(sent_payload['settings']['waiting_room'])
        self.assertEqual(
            sent_payload['settings']['waiting_room_options'],
            {'mode': 'custom', 'who_goes_to_waiting_room': 'everyone'},
        )

        # Failed update marks sync_state='pending_update' without raising
        mock_client.update_meeting.side_effect = ZoomError('Temporary 502')
        ok = update_zoom_meeting(m, client=mock_client, mute_upon_entry=False)
        self.assertFalse(ok)
        zm.refresh_from_db()
        self.assertEqual(zm.sync_state, 'pending_update')

        # Successful update clears pending_update
        mock_client.update_meeting.side_effect = None
        ok2 = update_zoom_meeting(m, client=mock_client, mute_upon_entry=False)
        self.assertTrue(ok2)
        zm.refresh_from_db()
        self.assertEqual(zm.sync_state, 'ok')

        # End meeting marks is_live=False
        zm.is_live = True
        zm.save()
        end_zoom_meeting(m, client=mock_client)
        zm.refresh_from_db()
        self.assertFalse(zm.is_live)
        self.assertIsNotNone(zm.ended_at)

        # Failed delete marks pending_delete
        mock_client.delete_meeting.side_effect = ZoomError('Network timeout')
        self.assertFalse(delete_zoom_meeting(m, client=mock_client))
        zm.refresh_from_db()
        self.assertEqual(zm.sync_state, 'pending_delete')

    def test_zak_caching_and_reconcile_command(self):
        host = ZoomHostAccount.objects.create(
            zoom_user_id='host-zak', email='zak@thewoddi.org', label='ZAK Host', capacity=300
        )
        mock_client = MagicMock(spec=ZoomClient)
        mock_client.get_user_zak.return_value = 'zak-jwt-token-xyz'

        z1 = get_host_zak(host, client=mock_client)
        z2 = get_host_zak(host, client=mock_client)
        self.assertEqual(z1, 'zak-jwt-token-xyz')
        self.assertEqual(z2, 'zak-jwt-token-xyz')
        self.assertEqual(mock_client.get_user_zak.call_count, 1)

        # Old webhook event cleanup via zoom_reconcile
        ev = ZoomWebhookEvent.objects.create(
            dedupe_key='old-dedupe-1', event='meeting.started', event_ts=1000, payload={}
        )
        ZoomWebhookEvent.objects.filter(pk=ev.pk).update(received_at=timezone.now() - timedelta(days=35))
        call_command('zoom_reconcile')
        self.assertFalse(ZoomWebhookEvent.objects.filter(pk=ev.pk).exists())
