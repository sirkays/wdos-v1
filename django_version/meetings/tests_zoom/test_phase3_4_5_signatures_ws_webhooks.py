from datetime import timedelta
import json
import time
from unittest.mock import patch
import jwt
from urllib.parse import unquote, urlparse
from asgiref.sync import sync_to_async
from asgiref.testing import ApplicationCommunicator


class WebsocketCommunicator(ApplicationCommunicator):
    """ASGI WebSocket test communicator (compatible without installing daphne)."""

    def __init__(self, application, path, headers=None, subprotocols=None):
        parsed = urlparse(path)
        self.scope = {
            'type': 'websocket',
            'path': unquote(parsed.path),
            'query_string': parsed.query.encode('utf-8'),
            'headers': headers or [(b'origin', b'http://localhost:8000')],
            'subprotocols': subprotocols or [],
        }
        super().__init__(application, self.scope)

    async def connect(self, timeout=2):
        await self.send_input({'type': 'websocket.connect'})
        response = await self.receive_output(timeout)
        if response['type'] == 'websocket.close':
            return False, response.get('code', 1000)
        return True, response.get('subprotocol')

    async def receive_json_from(self, timeout=2):
        response = await self.receive_output(timeout)
        assert response['type'] == 'websocket.send', f"Expected websocket.send, got {response}"
        return json.loads(response['text'])

    async def disconnect(self, code=1000, timeout=2):
        await self.send_input({'type': 'websocket.disconnect', 'code': code})
        await self.wait(timeout)
from django.core.cache import caches
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from core.models import OrgUnit, Profile, RoleAssignment, RoleCode
from onboarding.models import OnboardingProgress
from onboarding.steps import STEPS
from operations.models import Meeting
from realtime.publish import send as ws_send
from realtime.tickets import consume as consume_ticket, issue as issue_ticket
from wdos_project.asgi import application as asgi_application

from ..models import GuestSession, MeetingCheckin
from ..models_zoom import (
    VideoPlatformSettings,
    ZoomHostAccount,
    ZoomMeeting,
    ZoomParticipantSession,
    ZoomWebhookEvent,
)
from ..zoom.signature import claim_host_slot, get_host_claimant, make_sdk_signature
from ..zoom.webhooks import compute_webhook_signature
from .test_phase1_admin_models import ZOOM_TEST_SETTINGS


def _unlock_onboarding(profile):
    for s in STEPS:
        OnboardingProgress.objects.get_or_create(profile=profile, step_code=s['code'])
    profile.status = 'active'
    profile.save(update_fields=['status'])


@override_settings(**ZOOM_TEST_SETTINGS)
class Phase3SignaturesAndZoomRoomViewsTest(TestCase):
    def setUp(self):
        caches['zoom'].clear()
        self.unit = OrgUnit.objects.create(name='West Africa Region', level='region')
        self.other_unit = OrgUnit.objects.create(name='East Africa Region', level='region')

        self.host_user = Profile.objects.create_user(
            email='host@thewoddi.org',
            password='password123',
            first_name='Amina',
            last_name='Bello',
            org_unit=self.unit,
        )
        _unlock_onboarding(self.host_user)
        RoleAssignment.objects.create(profile=self.host_user, role=RoleCode.REGIONAL_DIRECTOR, org_unit=self.unit)

        self.second_mgr = Profile.objects.create_user(
            email='mgr2@thewoddi.org',
            password='password123',
            first_name='Kofi',
            last_name='Mensah',
            org_unit=self.unit,
            is_superuser=True,
            is_staff=True,
        )
        _unlock_onboarding(self.second_mgr)

        self.member_user = Profile.objects.create_user(
            email='member@thewoddi.org',
            password='password123',
            first_name='Zainab',
            last_name='Musa',
            org_unit=self.unit,
        )
        _unlock_onboarding(self.member_user)

        self.outsider_user = Profile.objects.create_user(
            email='outsider@thewoddi.org',
            password='password123',
            first_name='Out',
            last_name='Sider',
            org_unit=self.other_unit,
        )
        _unlock_onboarding(self.outsider_user)

        self.zoom_host = ZoomHostAccount.objects.create(
            zoom_user_id='zhost-1', email='zhost1@thewoddi.org', label='Zoom Host 1', capacity=300
        )
        now = timezone.now()
        self.meeting = Meeting.objects.create(
            title='Zoom Regional Assembly',
            org_unit=self.unit,
            organiser=self.host_user,
            mode='virtual',
            platform='zoom',
            audience='unit',
            access='anyone',
            guest_code='guestcode123',
            starts_at=now + timedelta(minutes=5),
            ends_at=now + timedelta(minutes=65),
        )
        self.zm = ZoomMeeting(
            meeting=self.meeting,
            host_account=self.zoom_host,
            zoom_meeting_id=9988776655,
            meeting_type=2,
            sync_state='ok',
        )
        self.zm.set_passcode('ZmPass9988')
        self.zm.save()

    def tearDown(self):
        caches['zoom'].clear()

    def test_jwt_signature_claims_and_expiry(self):
        sig = make_sdk_signature(9988776655, 1)
        decoded = jwt.decode(sig, ZOOM_TEST_SETTINGS['ZOOM_SDK_SECRET'], algorithms=['HS256'])
        self.assertEqual(decoded['sdkKey'], ZOOM_TEST_SETTINGS['ZOOM_SDK_KEY'])
        self.assertEqual(decoded['appKey'], ZOOM_TEST_SETTINGS['ZOOM_SDK_KEY'])
        self.assertEqual(decoded['mn'], '9988776655')
        self.assertEqual(decoded['role'], 1)
        self.assertEqual(decoded['video_webrtc_mode'], 1)
        self.assertEqual(decoded['exp'], decoded['tokenExp'])
        self.assertGreaterEqual(decoded['exp'] - decoded['iat'], 1800)

    @patch('meetings.zoom_views.get_host_zak', return_value='mock-zak-token-123')
    def test_host_claim_single_zak_and_non_manager_never_gets_zak(self, mock_zak):
        # 1. Non-manager requests signature -> role=0, no ZAK
        c_mem = Client()
        c_mem.force_login(self.member_user)
        resp_mem = c_mem.post(reverse('meetings:zoom_signature', args=[self.meeting.pk]))
        self.assertEqual(resp_mem.status_code, 200)
        self.assertEqual(resp_mem['Cache-Control'], 'no-store')
        data_mem = resp_mem.json()
        self.assertNotIn('zak', data_mem)
        self.assertEqual(data_mem['customerKey'], str(self.member_user.pk))
        self.assertEqual(len(data_mem['customerKey']), 36)
        dec_mem = jwt.decode(data_mem['signature'], ZOOM_TEST_SETTINGS['ZOOM_SDK_SECRET'], algorithms=['HS256'])
        self.assertEqual(dec_mem['role'], 0)

        # 2. First manager requests signature -> claims host slot, gets role=1 + ZAK
        c_host = Client()
        c_host.force_login(self.host_user)
        resp_host = c_host.post(reverse('meetings:zoom_signature', args=[self.meeting.pk]))
        self.assertEqual(resp_host.status_code, 200)
        data_host = resp_host.json()
        self.assertEqual(data_host.get('zak'), 'mock-zak-token-123')
        dec_host = jwt.decode(data_host['signature'], ZOOM_TEST_SETTINGS['ZOOM_SDK_SECRET'], algorithms=['HS256'])
        self.assertEqual(dec_host['role'], 1)

        # 3. Second manager requests signature while first holds claim -> gets role=0, no ZAK
        c_mgr2 = Client()
        c_mgr2.force_login(self.second_mgr)
        resp_mgr2 = c_mgr2.post(reverse('meetings:zoom_signature', args=[self.meeting.pk]))
        self.assertEqual(resp_mgr2.status_code, 200)
        data_mgr2 = resp_mgr2.json()
        self.assertNotIn('zak', data_mgr2)
        dec_mgr2 = jwt.decode(data_mgr2['signature'], ZOOM_TEST_SETTINGS['ZOOM_SDK_SECRET'], algorithms=['HS256'])
        self.assertEqual(dec_mgr2['role'], 0)

    def test_coop_coep_present_on_zoom_room_and_absent_on_livekit_room(self):
        c = Client()
        c.force_login(self.member_user)
        resp_zoom = c.get(reverse('meetings:zoom_room', args=[self.meeting.pk]))
        self.assertEqual(resp_zoom.status_code, 200)
        self.assertEqual(resp_zoom['Cross-Origin-Opener-Policy'], 'same-origin')
        self.assertEqual(resp_zoom['Cross-Origin-Embedder-Policy'], 'require-corp')
        self.assertEqual(resp_zoom['Cache-Control'], 'no-store')

        # Create a LiveKit meeting and confirm COOP/COEP headers are NOT added to room.html
        lk_meeting = Meeting.objects.create(
            title='LiveKit Room Check',
            org_unit=self.unit,
            organiser=self.host_user,
            mode='virtual',
            platform='woddi',
            audience='unit',
            starts_at=timezone.now() + timedelta(minutes=5),
            ends_at=timezone.now() + timedelta(minutes=65),
        )
        resp_lk = c.get(reverse('meetings:room', args=[lk_meeting.pk]))
        self.assertEqual(resp_lk.status_code, 200)
        self.assertNotIn('Cross-Origin-Opener-Policy', resp_lk)
        self.assertNotIn('Cross-Origin-Embedder-Policy', resp_lk)

    def test_gates_on_zoom_room_and_signature(self):
        # 1. Outsider cannot see unit-only meeting
        self.meeting.access = 'members'
        self.meeting.audience = 'unit'
        self.meeting.save()
        c_out = Client()
        c_out.force_login(self.outsider_user)
        self.assertEqual(c_out.get(reverse('meetings:zoom_room', args=[self.meeting.pk])).status_code, 404)
        self.assertEqual(c_out.post(reverse('meetings:zoom_signature', args=[self.meeting.pk])).status_code, 404)

        # 2. Passcode gate for non-manager member
        self.meeting.passcode = '123456'
        self.meeting.save()
        c_mem = Client()
        c_mem.force_login(self.member_user)
        self.assertEqual(c_mem.get(reverse('meetings:zoom_room', args=[self.meeting.pk])).status_code, 302)
        self.assertEqual(c_mem.post(reverse('meetings:zoom_signature', args=[self.meeting.pk])).status_code, 403)

        # 3. Outside window (starts 2 hours from now)
        self.meeting.passcode = ''
        self.meeting.starts_at = timezone.now() + timedelta(hours=2)
        self.meeting.ends_at = timezone.now() + timedelta(hours=3)
        self.meeting.save()
        self.assertEqual(c_mem.get(reverse('meetings:zoom_room', args=[self.meeting.pk])).status_code, 302)
        self.assertEqual(c_mem.post(reverse('meetings:zoom_signature', args=[self.meeting.pk])).status_code, 403)

        # 4. Guest not admitted cannot access guest_zoom_room or guest_zoom_signature
        self.meeting.access = 'anyone'
        self.meeting.starts_at = timezone.now() + timedelta(minutes=5)
        self.meeting.save()
        g = GuestSession.objects.create(meeting=self.meeting, name='External Guest', status='waiting')
        c_guest = Client()
        sess = c_guest.session
        sess[f'guest_{self.meeting.pk}'] = g.pk
        sess.save()
        self.assertEqual(c_guest.get(reverse('meetings:guest_zoom_room', args=['guestcode123'])).status_code, 302)
        self.assertEqual(
            c_guest.post(reverse('meetings:guest_zoom_signature', args=['guestcode123'])).status_code, 403
        )

        # Admit guest -> both succeed
        g.status = 'admitted'
        g.save()
        resp_gr = c_guest.get(reverse('meetings:guest_zoom_room', args=['guestcode123']))
        self.assertEqual(resp_gr.status_code, 200)
        self.assertEqual(resp_gr['Cross-Origin-Embedder-Policy'], 'require-corp')
        resp_gs = c_guest.post(reverse('meetings:guest_zoom_signature', args=['guestcode123']))
        self.assertEqual(resp_gs.status_code, 200)
        self.assertEqual(resp_gs.json()['customerKey'], f'guest-{g.pk}')
        self.assertNotIn('zak', resp_gs.json())


@override_settings(**ZOOM_TEST_SETTINGS)
class Phase4TicketsAndChannelsTest(TransactionTestCase):
    def setUp(self):
        caches['zoom'].clear()

    def tearDown(self):
        caches['zoom'].clear()

    def test_ticket_single_use_and_expiry(self):
        tok = issue_ticket({'kind': 'member', 'sub': 'u-1', 'meeting': 'm-1', 'role': 'manager'})
        first = consume_ticket(tok)
        self.assertIsNotNone(first)
        self.assertEqual(first['role'], 'manager')
        # Second consume of same ticket must fail (single-use nonce)
        self.assertIsNone(consume_ticket(tok))
        # Expired ticket fails
        self.assertIsNone(consume_ticket(issue_ticket({'kind': 'member', 'sub': 'u-1', 'meeting': 'm-1'}), max_age=-1))

    async def test_websocket_consumers_group_isolation_and_ticket_enforcement(self):
        mtg_id = '11111111-2222-3333-4444-555555555555'
        mgr_ticket = await sync_to_async(issue_ticket)(
            {'kind': 'member', 'sub': 'mgr-1', 'meeting': mtg_id, 'role': 'manager'}
        )
        mem_ticket = await sync_to_async(issue_ticket)(
            {'kind': 'member', 'sub': 'mem-1', 'meeting': mtg_id, 'role': 'member'}
        )
        guest_ticket = await sync_to_async(issue_ticket)(
            {'kind': 'guest', 'sub': '42', 'meeting': mtg_id, 'role': 'guest', 'code': 'gcode'}
        )

        mgr_comm = WebsocketCommunicator(asgi_application, f'/ws/meetings/{mtg_id}/?ticket={mgr_ticket}')
        mem_comm = WebsocketCommunicator(asgi_application, f'/ws/meetings/{mtg_id}/?ticket={mem_ticket}')
        guest_comm = WebsocketCommunicator(asgi_application, f'/ws/guest/gcode/?ticket={guest_ticket}')

        connected_mgr, _ = await mgr_comm.connect()
        connected_mem, _ = await mem_comm.connect()
        connected_guest, _ = await guest_comm.connect()
        self.assertTrue(connected_mgr)
        self.assertTrue(connected_mem)
        self.assertTrue(connected_guest)

        # Replaying mgr_ticket is rejected with 4401
        replay_comm = WebsocketCommunicator(asgi_application, f'/ws/meetings/{mtg_id}/?ticket={mgr_ticket}')
        await replay_comm.connect()
        close_msg = await replay_comm.receive_output(timeout=2)
        self.assertEqual(close_msg['type'], 'websocket.close')
        self.assertEqual(close_msg['code'], 4401)

        # Broadcast checkin to mtg.<pk> -> both manager and member receive it, guest does not
        await sync_to_async(ws_send)(f'mtg.{mtg_id}', {'type': 'checkin', 'name': 'Ada', 'at': '10:00 AM'}, immediate=True)
        mgr_ev = await mgr_comm.receive_json_from(timeout=2)
        mem_ev = await mem_comm.receive_json_from(timeout=2)
        self.assertEqual(mgr_ev['type'], 'checkin')
        self.assertEqual(mem_ev['type'], 'checkin')
        self.assertTrue(await guest_comm.receive_nothing(timeout=0.2))

        # Broadcast host-only promote event to mtg.<pk>.hosts -> ONLY manager receives it, member does NOT
        await sync_to_async(ws_send)(
            f'mtg.{mtg_id}.hosts',
            {'type': 'promote', 'participantId': '99', 'customerKey': 'ck-mgr2'},
            immediate=True,
        )
        host_ev = await mgr_comm.receive_json_from(timeout=2)
        self.assertEqual(host_ev['type'], 'promote')
        self.assertTrue(await mem_comm.receive_nothing(timeout=0.2))

        # Broadcast guest lobby_status to guest.42 -> ONLY that guest receives it
        await sync_to_async(ws_send)('guest.42', {'type': 'lobby_status', 'status': 'admitted'}, immediate=True)
        g_ev = await guest_comm.receive_json_from(timeout=2)
        self.assertEqual(g_ev, {'type': 'lobby_status', 'status': 'admitted'})

        await mgr_comm.disconnect()
        await mem_comm.disconnect()
        await guest_comm.disconnect()


@override_settings(**ZOOM_TEST_SETTINGS)
class Phase5WebhooksTest(TestCase):
    def setUp(self):
        caches['zoom'].clear()
        self.unit = OrgUnit.objects.create(name='HQ Unit', level='hq')
        self.host_user = Profile.objects.create_user(
            email='host@thewoddi.org',
            password='password123',
            first_name='Host',
            last_name='One',
            org_unit=self.unit,
            is_superuser=True,
            is_staff=True,
        )
        self.cohost_mgr = Profile.objects.create_user(
            email='cohost@thewoddi.org',
            password='password123',
            first_name='Co',
            last_name='Host',
            org_unit=self.unit,
            is_superuser=True,
            is_staff=True,
        )
        self.zhost = ZoomHostAccount.objects.create(
            zoom_user_id='zh-1', email='zh1@thewoddi.org', label='ZH1', capacity=300
        )
        self.meeting = Meeting.objects.create(
            title='Webhook Test Meeting',
            org_unit=self.unit,
            organiser=self.host_user,
            platform='zoom',
            status='scheduled',
            starts_at=timezone.now(),
            ends_at=timezone.now() + timedelta(hours=1),
        )
        self.zm = ZoomMeeting.objects.create(
            meeting=self.meeting,
            host_account=self.zhost,
            zoom_meeting_id=7766554433,
            meeting_type=2,
            passcode_enc='enc',
        )
        self.url = reverse('meetings:zoom_webhook')

    def _post_webhook(self, payload: dict, ts: int | None = None, sig: str | None = None):
        raw = json.dumps(payload)
        ts_str = str(ts if ts is not None else int(time.time()))
        signature = sig if sig is not None else compute_webhook_signature(
            ZOOM_TEST_SETTINGS['ZOOM_WEBHOOK_SECRET_TOKEN'], ts_str, raw
        )
        return self.client.post(
            self.url,
            data=raw,
            content_type='application/json',
            HTTP_X_ZM_REQUEST_TIMESTAMP=ts_str,
            HTTP_X_ZM_SIGNATURE=signature,
        )

    def test_url_validation_handshake_and_signature_verification(self):
        # 1. URL validation
        resp = self._post_webhook({'event': 'endpoint.url_validation', 'payload': {'plainToken': 'abc123plain'}})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['plainToken'], 'abc123plain')
        self.assertEqual(len(data['encryptedToken']), 64)

        # 2. Invalid signature -> 401
        resp_bad = self._post_webhook(
            {'event': 'meeting.started', 'event_ts': int(time.time()), 'payload': {'object': {'id': 7766554433}}},
            sig='v0=deadbeef',
        )
        self.assertEqual(resp_bad.status_code, 401)

        # 3. Stale timestamp (> 300s old) -> 401
        old_ts = int(time.time()) - 600
        resp_stale = self._post_webhook(
            {'event': 'meeting.started', 'event_ts': old_ts, 'payload': {'object': {'id': 7766554433}}},
            ts=old_ts,
        )
        self.assertEqual(resp_stale.status_code, 401)

    @patch('meetings.zoom.webhooks.ws_send')
    def test_webhook_lifecycle_started_joined_cohost_left_ended_and_dedupe(self, mock_ws_send):
        claim_host_slot(self.meeting, self.host_user)
        now_ts = int(time.time())

        # 1. meeting.started
        p_start = {'event': 'meeting.started', 'event_ts': now_ts, 'payload': {'object': {'id': '7766554433'}}}
        r1 = self._post_webhook(p_start, ts=now_ts)
        self.assertEqual(r1.status_code, 200)
        self.zm.refresh_from_db()
        self.meeting.refresh_from_db()
        self.assertTrue(self.zm.is_live)
        self.assertEqual(self.meeting.status, 'in_progress')

        # Duplicate delivery is ignored idempotently
        r1_dup = self._post_webhook(p_start, ts=now_ts)
        self.assertEqual(r1_dup.status_code, 200)
        self.assertTrue(r1_dup.json().get('duplicate'))
        self.assertEqual(ZoomWebhookEvent.objects.count(), 1)

        # 2. meeting.participant_joined for second manager -> records checkin + session + sends 'promote'
        p_join = {
            'event': 'meeting.participant_joined',
            'event_ts': now_ts + 1,
            'payload': {
                'object': {
                    'id': '7766554433',
                    'participant': {
                        'user_id': '16778240',
                        'participant_uuid': 'puuid-cohost-1',
                        'user_name': 'Co Host',
                        'customer_key': str(self.cohost_mgr.pk),
                    },
                }
            },
        }
        r2 = self._post_webhook(p_join, ts=now_ts)
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(MeetingCheckin.objects.filter(meeting=self.meeting, profile=self.cohost_mgr).exists())
        sess = ZoomParticipantSession.objects.filter(zoom_meeting=self.zm, profile=self.cohost_mgr).first()
        self.assertIsNotNone(sess)
        self.assertIsNone(sess.left_at)

        # Verify promote was sent to mtg.<pk>.hosts
        host_calls = [
            c for c in mock_ws_send.call_args_list if c[0][0] == f'mtg.{self.meeting.pk}.hosts'
        ]
        self.assertEqual(len(host_calls), 1)
        self.assertEqual(
            host_calls[0][0][1],
            {'type': 'promote', 'participantId': '16778240', 'customerKey': str(self.cohost_mgr.pk)},
        )

        # 3. meeting.participant_left for claiming host -> releases host claim
        p_left = {
            'event': 'meeting.participant_left',
            'event_ts': now_ts + 2,
            'payload': {
                'object': {
                    'id': '7766554433',
                    'participant': {
                        'user_id': '16778200',
                        'participant_uuid': 'puuid-host-1',
                        'user_name': 'Host One',
                        'customer_key': str(self.host_user.pk),
                        'leave_reason': 'left meeting',
                    },
                }
            },
        }
        self._post_webhook(p_left, ts=now_ts)
        self.assertIsNone(get_host_claimant(self.meeting))

        # 4. meeting.ended -> sets is_live=False, does NOT mark meeting status='completed'
        p_end = {'event': 'meeting.ended', 'event_ts': now_ts + 3, 'payload': {'object': {'id': '7766554433'}}}
        self._post_webhook(p_end, ts=now_ts)
        self.zm.refresh_from_db()
        self.meeting.refresh_from_db()
        self.assertFalse(self.zm.is_live)
        self.assertEqual(self.meeting.status, 'in_progress')
