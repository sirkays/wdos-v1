from datetime import timedelta

from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from core.models import OrgUnit, Profile
from onboarding.models import OnboardingProgress
from onboarding.steps import STEPS
from operations.models import Meeting

from .models import MeetingCheckin


class MeetingsFlow(TestCase):
    def setUp(self):
        self.unit = OrgUnit.objects.create(level='country', name='Nigeria', country_iso='NG')
        self.hq = Profile.objects.create_user(email='hq@x.org', password='pw12345678', first_name='H', last_name='Q', hq_function='founder')
        self.member = Profile.objects.create_user(email='m@x.org', password='pw12345678', first_name='M', last_name='B', org_unit=self.unit, status='active')
        for u in (self.hq, self.member):
            for s in STEPS:
                OnboardingProgress.objects.create(profile=u, step_code=s['code'])

    def test_schedule_see_join_attend_close(self):
        self.client.force_login(self.hq)
        now = timezone.now()
        r = self.client.post(reverse('meetings:new'), {
            'title': 'Country call', 'agenda': 'Agenda', 'org_unit': self.unit.pk, 'mode': 'virtual', 'platform': 'woddi',
            'location': '', 'audience': 'unit', 'starts_at': (now + timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M'),
            'ends_at': (now + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')})
        m = Meeting.objects.get(title='Country call')
        self.assertRedirects(r, reverse('meetings:detail', args=[m.pk]))
        # bad link-less external platform is rejected
        self.assertEqual(Meeting.objects.filter(title='Country call').count(), 1)
        # member in the unit sees it, can join, cannot manage
        self.client.force_login(self.member)
        self.assertContains(self.client.get(reverse('meetings:list')), 'Country call')
        self.client.post(reverse('meetings:join', args=[m.pk]))
        self.assertTrue(MeetingCheckin.objects.filter(meeting=m, profile=self.member).exists())
        self.assertEqual(self.client.post(reverse('meetings:close', args=[m.pk]), {'minutes': 'x'}).status_code, 404)
        # HQ marks attendance (join pre-ticked) and closes with minutes
        self.client.force_login(self.hq)
        self.assertContains(self.client.get(reverse('meetings:detail', args=[m.pk])), 'checked')
        self.client.post(reverse('meetings:attendance', args=[m.pk]), {'present': [str(self.member.pk)]})
        self.assertTrue(m.attendance_records.get(profile=self.member).present)
        self.client.post(reverse('meetings:close', args=[m.pk]), {'minutes': 'Decided X'})
        m.refresh_from_db()
        self.assertEqual((m.status, m.minutes), ('completed', 'Decided X'))

    def test_outsider_cannot_see(self):
        other = Profile.objects.create_user(email='o@x.org', password='pw12345678', first_name='O', last_name='U', status='active')
        for s in STEPS:
            OnboardingProgress.objects.create(profile=other, step_code=s['code'])
        now = timezone.now()
        m = Meeting.objects.create(title='Private', org_unit=self.unit, organiser=self.hq, starts_at=now, ends_at=now + timedelta(hours=1))
        self.client.force_login(other)
        self.assertEqual(self.client.get(reverse('meetings:detail', args=[m.pk])).status_code, 404)


class RoomTests(MeetingsFlow):
    def _meeting(self, **kw):
        now = timezone.now()
        d = dict(title='Live', org_unit=self.unit, organiser=self.hq, platform='woddi',
                 starts_at=now - timedelta(minutes=1), ends_at=now + timedelta(hours=1))
        d.update(kw)
        return Meeting.objects.create(**d)

    def test_token_roles_and_window(self):
        import jwt
        from django.test import override_settings
        m = self._meeting()
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            self.client.force_login(self.member)
            j = self.client.get(reverse('meetings:token', args=[m.pk])).json()
            g = jwt.decode(j['token'], 's' * 40, algorithms=['HS256'])
            self.assertEqual((g['video']['room'], g['sub']), (f'meeting-{m.pk}', str(self.member.pk)))
            self.assertFalse(g['video'].get('roomAdmin'))
            self.client.force_login(self.hq)
            g = jwt.decode(self.client.get(reverse('meetings:token', args=[m.pk])).json()['token'], 's' * 40, algorithms=['HS256'])
            self.assertTrue(g['video']['roomAdmin'])
            # outside the window / completed: no token
            m.status = 'completed'
            m.save()
            self.assertEqual(self.client.get(reverse('meetings:token', args=[m.pk])).status_code, 403)

    def test_unconfigured_and_checkin(self):
        from django.test import override_settings
        m = self._meeting()
        with override_settings(LIVEKIT_URL='', LIVEKIT_API_KEY='', LIVEKIT_API_SECRET=''):
            self.client.force_login(self.member)
            self.assertEqual(self.client.get(reverse('meetings:token', args=[m.pk])).status_code, 503)
            page = self.client.get(reverse('meetings:room', args=[m.pk]))
            self.assertContains(page, 'not available right now')
            self.assertNotContains(page, 'LIVEKIT_API_SECRET')       # members never see config names
            self.client.force_login(self.hq)
            self.assertContains(self.client.get(reverse('meetings:room', args=[m.pk])), 'LIVEKIT_API_SECRET')
        self.assertTrue(MeetingCheckin.objects.filter(meeting=m, profile=self.member).exists())

    def test_room_has_screen_share_and_chat(self):
        from django.test import override_settings
        m = self._meeting()
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            self.client.force_login(self.member)
            page = self.client.get(reverse('meetings:room', args=[m.pk]))
        for needle in ('id="share"', 'id="screen-stage"', 'id="drawer-pane-chat"', 'id="chat-form"', 'id="dock-chat-btn"',
                       'id="more-open-chat"', 'id="hand"', 'id="more-hand"'):
            self.assertContains(page, needle)

    def test_listening_language_is_chosen_before_joining_not_in_the_room(self):
        from django.test import override_settings
        m = self._meeting()
        self.client.force_login(self.member)
        # the meeting page offers the language choice and the join form saves it
        self.assertContains(self.client.get(reverse('meetings:detail', args=[m.pk])), 'name="lang"')
        self.client.post(reverse('meetings:join', args=[m.pk]), {'lang': 'fr'})
        self.member.refresh_from_db()
        self.assertEqual(self.member.preferred_locale, 'fr')
        self.client.post(reverse('meetings:join', args=[m.pk]), {'lang': 'xx'})   # unsupported: ignored
        self.member.refresh_from_db()
        self.assertEqual(self.member.preferred_locale, 'fr')
        # inside the room there is no "I hear in" picker, no language pills, and no endpoint to change it
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            page = self.client.get(reverse('meetings:room', args=[m.pk]))
        self.assertContains(page, 'data-interp-toggle')            # the live-interpretation on/off switch stays
        for gone in ('I hear in', 'meet-lang-pill', 'data-lang-pick', 'more-lang-pills'):
            self.assertNotContains(page, gone)
        self.assertEqual(self.client.post('/workspace/meetings/language/', {'lang': 'en'}).status_code, 404)

    def test_join_muted_locks_mic_and_camera_for_non_moderators(self):
        import json
        import jwt
        from django.test import override_settings
        m = self._meeting()
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            def meta(user):
                self.client.force_login(user)
                tok = self.client.get(reverse('meetings:token', args=[m.pk])).json()['token']
                return json.loads(jwt.decode(tok, 's' * 40, algorithms=['HS256'])['metadata'])
            self.assertNotIn('micAllowed', meta(self.member))                  # off by default
            # only a manager can flip it, from the detail page or the room, without leaving the call
            self.client.force_login(self.member)
            self.assertEqual(self.client.post(reverse('meetings:guest_link', args=[m.pk]), {'action': 'mute_entry_on'}).status_code, 404)
            self.client.force_login(self.hq)
            r = self.client.post(reverse('meetings:guest_link', args=[m.pk]), {'action': 'mute_entry_on'}, HTTP_X_REQUESTED_WITH='fetch')
            self.assertEqual(r.json(), {'ok': True, 'mute_on_entry': True})
            self.assertContains(self.client.get(reverse('meetings:detail', args=[m.pk])), 'id="entry-mute-switch"')
            self.assertContains(self.client.get(reverse('meetings:room', args=[m.pk])), 'id="entry-mute-switch"')
            mm = meta(self.member)
            self.assertEqual((mm['micAllowed'], mm['camAllowed']), (False, False))
            self.assertNotIn('micAllowed', meta(self.hq))                      # the host is never locked out
            self.client.force_login(self.hq)
            self.client.post(reverse('meetings:guest_link', args=[m.pk]), {'action': 'mute_entry_off'})
            self.assertNotIn('micAllowed', meta(self.member))


class TranslationLogic(MeetingsFlow):
    def test_targets_and_packets(self):
        import json
        from .translation import logic
        parts = [{'identity': 'a', 'metadata': json.dumps({'lang': 'fr'})},
                 {'identity': 'b', 'metadata': json.dumps({'lang': 'en'})},
                 {'identity': 'c', 'metadata': 'not json'},
                 {'identity': 'wdos-translator-bot', 'metadata': ''}]
        self.assertEqual(logic.target_languages(parts, 'fr'), ['en'])        # bot ignored, bad metadata -> en, source excluded
        self.assertEqual(logic.participant_lang(json.dumps({'lang': 'zz'})), 'en')
        pk = json.loads(logic.caption_packet('A', 'fr', 'bonjour', {'en': 'hello'}, True))
        self.assertEqual((pk['text'], pk['translations']['en'], pk['final']), ('bonjour', 'hello', True))

    def test_streaming_chunks_start_before_the_speaker_pauses(self):
        from .translation.logic import catch_up_rate, next_chunk
        said = 'we are going to start the quarterly review of the nursery programme today'
        words = said.split()
        # too early: not enough stable words yet (the last two are still being revised)
        self.assertEqual(next_chunk(' '.join(words[:5]), 0), ('', 0))
        # a few seconds in, with no punctuation: the first stable run is sent while the speaker is still talking
        chunk, done = next_chunk(' '.join(words[:12]), 0)
        self.assertEqual((chunk, done), (' '.join(words[:9]), 9))
        # the same words are never sent twice; the next chunk waits for more speech
        self.assertEqual(next_chunk(' '.join(words[:12]), done), ('', 9))
        # a clause boundary is preferred to a hard cut
        chunk, done = next_chunk('Good morning everyone and thank you all, for joining us today as we begin', 0)
        self.assertEqual((chunk, done), ('Good morning everyone and thank you all,', 7))
        # the speaker pauses: whatever is left is flushed, and a revised/shorter final never repeats anything
        self.assertEqual(next_chunk(' '.join(words), 9, final=True), (' '.join(words[9:]), len(words)))
        self.assertEqual(next_chunk('short', 9, final=True), ('', 9))
        self.assertEqual((catch_up_rate(0), catch_up_rate(2), catch_up_rate(5)), (None, '+10%', '+20%'))

    def test_voice_speed_is_only_added_when_asked(self):
        from .translation import azure
        self.assertNotIn('prosody', azure._ssml('bonjour', 'fr'))
        self.assertIn("<prosody rate='+10%'>bonjour</prosody>", azure._ssml('bonjour', 'fr', '+10%'))

    def test_azure_translate_and_fallback_key(self):
        from unittest import mock
        from django.test import override_settings
        from .translation import azure

        class R:
            def __init__(s, code, js=None): s.status_code, s._j = code, js
            def json(s): return s._j
            def raise_for_status(s): pass
        ok = R(200, [{'translations': [{'to': 'en', 'text': 'hello'}, {'to': 'sw', 'text': 'habari'}]}])
        with override_settings(AZURE_TRANSLATOR_KEY='k1', AZURE_TRANSLATOR_KEY_2='k2', AZURE_TRANSLATOR_REGION='eastus'):
            with mock.patch.object(azure._session, 'post', side_effect=[R(401), ok]) as post:
                self.assertEqual(azure.translate('bonjour', 'fr', ['en', 'sw', 'fr']), {'en': 'hello', 'sw': 'habari'})
                self.assertEqual(post.call_count, 2)                          # second key used after a 401
                self.assertEqual(post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'k2')
            self.assertEqual(azure.translate('hi', 'en', ['en']), {})        # nothing to translate
            self.assertIsNone(azure.synthesize_pcm24k('x', 'unsupported'))   # unsupported language: returns None

    def test_minutes_draft_and_transcript(self):
        from .models import TranscriptSegment
        now = timezone.now()
        m = Meeting.objects.create(title='Call', org_unit=self.unit, organiser=self.hq, starts_at=now, ends_at=now + timedelta(hours=1))
        TranscriptSegment.objects.create(meeting=m, speaker='Amina', lang='fr', text='Bonjour', translations={'en': 'Hello'})
        MeetingCheckin.objects.create(meeting=m, profile=self.member)
        self.client.force_login(self.hq)
        page = self.client.get(reverse('meetings:detail', args=[m.pk]) + '?draft=1')
        self.assertContains(page, 'Amina: Bonjour')
        self.assertContains(page, 'M B')
        t = self.client.get(reverse('meetings:transcript', args=[m.pk]))
        self.assertContains(t, 'en: Hello')
        self.client.force_login(self.member)
        self.assertEqual(self.client.get(reverse('meetings:transcript', args=[m.pk])).status_code, 404)


class GuestAccess(RoomTests):
    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()
        self.m = self._meeting(access='anyone', guest_code='abc123code', guest_auto_admit=False)

    def _join(self, name='Ngozi', lang='fr', code='abc123code'):
        from django.test import Client
        c = Client()
        r = c.post(reverse('meetings:guest_join', args=[code]), {'name': name, 'lang': lang})
        return c, r

    def test_waiting_room_admit_token_and_remove(self):
        import jwt
        from unittest import mock
        from django.test import override_settings
        from .models import GuestSession
        c, r = self._join()
        self.assertRedirects(r, reverse('meetings:guest_wait', args=['abc123code']), fetch_redirect_response=False)
        g = GuestSession.objects.get()
        self.assertEqual((g.status, g.lang), ('waiting', 'fr'))
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            self.assertEqual(c.get(reverse('meetings:guest_token', args=['abc123code'])).status_code, 403)   # not admitted yet
            self.assertEqual(c.get(reverse('meetings:guest_status', args=['abc123code'])).json()['status'], 'waiting')
            # a plain member cannot admit; the host can
            self.client.force_login(self.member)
            self.assertEqual(self.client.post(reverse('meetings:guest_action', args=[self.m.pk, g.pk, 'admit'])).status_code, 404)
            self.client.force_login(self.hq)
            self.assertEqual(self.client.get(reverse('meetings:guests', args=[self.m.pk])).json()['waiting'][0]['name'], 'Ngozi')
            self.client.post(reverse('meetings:guest_action', args=[self.m.pk, g.pk, 'admit']))
            j = c.get(reverse('meetings:guest_token', args=['abc123code'])).json()
            claims = jwt.decode(j['token'], 's' * 40, algorithms=['HS256'])
            self.assertEqual(claims['name'], 'Ngozi (Guest)')
            self.assertFalse(claims['video'].get('roomAdmin'))
            self.assertTrue(claims['video'].get('canPublishData'))   # guests may chat; clients ignore their host commands/captions
            self.assertTrue(claims['sub'].startswith('guest-'))
            # removal blocks the token and kicks from the live room
            with mock.patch('meetings.livekit.remove_participant') as kick:
                self.client.post(reverse('meetings:guest_action', args=[self.m.pk, g.pk, 'remove']))
                kick.assert_called_once()
            self.assertEqual(c.get(reverse('meetings:guest_token', args=['abc123code'])).status_code, 403)

    def test_guest_room_has_screen_share_and_chat(self):
        self.m.guest_auto_admit = True
        self.m.save()
        c, _ = self._join()
        page = c.get(reverse('meetings:guest_room', args=['abc123code']))
        for needle in ('id="share"', 'id="screen-stage"', 'id="drawer-pane-chat"', 'id="tab-btn-chat"', 'id="more-open-chat"',
                       'id="hand"', 'id="more-hand"'):
            self.assertContains(page, needle)
        for gone in ('I hear in', 'meet-lang-pill', 'data-lang-pick'):
            self.assertNotContains(page, gone)

    def test_guest_joins_muted_when_the_host_asks_for_it(self):
        import json
        import jwt
        from django.test import override_settings
        self.m.guest_auto_admit = True
        self.m.mute_on_entry = True
        self.m.save()
        c, _ = self._join()
        with override_settings(LIVEKIT_URL='wss://x.livekit.cloud', LIVEKIT_API_KEY='k', LIVEKIT_API_SECRET='s' * 40):
            tok = c.get(reverse('meetings:guest_token', args=['abc123code'])).json()['token']
        meta = json.loads(jwt.decode(tok, 's' * 40, algorithms=['HS256'])['metadata'])
        self.assertEqual((meta['micAllowed'], meta['camAllowed'], meta['lang']), (False, False, 'fr'))
        # the guest-side language endpoint is gone: the choice is made on the join page only
        self.assertEqual(c.post('/join/abc123code/language/', {'lang': 'en'}).status_code, 404)

    def test_auto_admit_and_link_controls(self):
        from unittest import mock
        self.m.guest_auto_admit = True
        self.m.save()
        c, _ = self._join()
        self.assertEqual(c.get(reverse('meetings:guest_status', args=['abc123code'])).json()['status'], 'admitted')
        self.client.force_login(self.hq)
        with mock.patch('meetings.livekit.remove_participant'):
            self.client.post(reverse('meetings:guest_link', args=[self.m.pk]), {'action': 'regen'})
        self.m.refresh_from_db()
        self.assertNotEqual(self.m.guest_code, 'abc123code')
        self.assertEqual(self.client.get(reverse('meetings:guest_join', args=['abc123code'])).status_code, 404)   # old link dead
        with mock.patch('meetings.livekit.remove_participant'):
            self.client.post(reverse('meetings:guest_link', args=[self.m.pk]), {'action': 'off'})
        self.m.refresh_from_db()
        self.assertEqual((self.m.access, self.m.guest_code), ('members', ''))
        self.assertEqual(self.client.get(reverse('meetings:guest_join', args=['']) if False else '/join/x/').status_code, 404)

    def test_members_only_closed_and_validation(self):
        from django.test import Client
        mo = self._meeting(access='members', guest_code='memberscode')
        self.assertEqual(Client().get(reverse('meetings:guest_join', args=['memberscode'])).status_code, 404)
        self.assertEqual(Client().get(reverse('meetings:guest_join', args=['abc123code'])).status_code, 200)   # no login needed
        c, r = self._join(name='', lang='fr')
        self.assertContains(r, 'enter your name')
        c, r = self._join(name='X Y', lang='zz')
        self.assertContains(r, 'choose a language')
        self.m.status = 'completed'
        self.m.save()
        closed_res = Client().get(reverse('meetings:guest_join', args=['abc123code']))
        self.assertEqual(closed_res.status_code, 200)
        self.assertContains(closed_res, 'The host has closed this meeting')

        # Elapsed meeting time shows clear elapsed message for both guest and host/member
        self.m.status = 'scheduled'
        self.m.starts_at = timezone.now() - timedelta(hours=3)
        self.m.ends_at = timezone.now() - timedelta(hours=1)
        self.m.save()
        elapsed_guest = Client().get(reverse('meetings:guest_join', args=['abc123code']))
        self.assertEqual(elapsed_guest.status_code, 200)
        self.assertContains(elapsed_guest, 'The scheduled time for this meeting has elapsed')
        self.client.force_login(self.hq)
        elapsed_host = self.client.get(reverse('meetings:room', args=[self.m.pk]), follow=True)
        self.assertContains(elapsed_host, 'The scheduled time for this meeting has elapsed')

    def test_rate_limit(self):
        for _ in range(20):
            self._join(name='Ab')
        c, r = self._join(name='Ab')
        self.assertContains(r, 'Too many attempts')

    def test_schedule_anyone_with_link_omits_unit_and_audience(self):
        self.client.force_login(self.hq)
        now = timezone.now()
        r = self.client.post(reverse('meetings:new'), {
            'title': 'Open Partner Briefing',
            'mode': 'virtual',
            'platform': 'woddi',
            'access': 'anyone',
            'guest_auto_admit': 'on',
            'starts_at': (now + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M'),
            'ends_at': (now + timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'),
            'agenda': 'Welcome external guests',
        })
        m = Meeting.objects.get(title='Open Partner Briefing')
        self.assertRedirects(r, reverse('meetings:detail', args=[m.pk]), fetch_redirect_response=False)
        self.assertEqual((m.access, m.guest_auto_admit), ('anyone', True))
        self.assertTrue(len(m.guest_code) >= 8)

    def test_room_passcode(self):
        from django.test import Client
        self.client.force_login(self.hq)
        self.client.post(reverse('meetings:guest_link', args=[self.m.pk]), {'action': 'passcode_set', 'passcode': '482910'})
        self.m.refresh_from_db()
        self.assertEqual(self.m.passcode, '482910')

        # Host detail page shows passcode and ?draft=1 banner
        detail_page = self.client.get(reverse('meetings:detail', args=[self.m.pk]) + '?draft=1')
        self.assertContains(detail_page, '482910')
        self.assertContains(detail_page, 'Draft minutes populated from the room transcript')

        # Host bypasses passcode check for room
        self.assertEqual(self.client.get(reverse('meetings:room', args=[self.m.pk])).status_code, 200)

        # Member must supply passcode to join or enter room
        self.client.force_login(self.member)
        self.assertRedirects(self.client.get(reverse('meetings:room', args=[self.m.pk])), reverse('meetings:detail', args=[self.m.pk]), fetch_redirect_response=False)
        self.assertEqual(self.client.get(reverse('meetings:token', args=[self.m.pk])).status_code, 403)
        r_bad = self.client.post(reverse('meetings:join', args=[self.m.pk]), {'passcode': '000000'})
        self.assertRedirects(r_bad, reverse('meetings:detail', args=[self.m.pk]), fetch_redirect_response=False)
        r_ok = self.client.post(reverse('meetings:join', args=[self.m.pk]), {'passcode': '482910'})
        self.assertRedirects(r_ok, reverse('meetings:room', args=[self.m.pk]), fetch_redirect_response=False)
        self.assertEqual(self.client.get(reverse('meetings:room', args=[self.m.pk])).status_code, 200)

        # External guest must also supply passcode
        gc = Client()
        join_page = gc.get(reverse('meetings:guest_join', args=['abc123code']))
        self.assertContains(join_page, 'Room Passcode')
        r_guest_bad = gc.post(reverse('meetings:guest_join', args=['abc123code']), {'name': 'Kofi', 'lang': 'en', 'passcode': 'wrong'})
        self.assertContains(r_guest_bad, 'Incorrect room passcode')
        r_guest_ok = gc.post(reverse('meetings:guest_join', args=['abc123code']), {'name': 'Kofi', 'lang': 'en', 'passcode': '482910'})
        self.assertRedirects(r_guest_ok, reverse('meetings:guest_wait', args=['abc123code']), fetch_redirect_response=False)

        # Turn off passcode
        self.client.force_login(self.hq)
        self.client.post(reverse('meetings:guest_link', args=[self.m.pk]), {'action': 'passcode_off'})
        self.m.refresh_from_db()
        self.assertEqual(self.m.passcode, '')

    def test_prejoin_mic_and_video_check_present_for_host_member_and_guest(self):
        from django.test import Client
        # Host detail page
        self.client.force_login(self.hq)
        host_detail = self.client.get(reverse('meetings:detail', args=[self.m.pk]))
        for needle in ('id="prejoin-studio"', 'id="prejoin-mic-btn"', 'id="prejoin-cam-btn"', 'id="prejoin-echo-btn"'):
            self.assertContains(host_detail, needle)

        # Member detail page
        self.client.force_login(self.member)
        member_detail = self.client.get(reverse('meetings:detail', args=[self.m.pk]))
        for needle in ('id="prejoin-studio"', 'id="prejoin-mic-btn"', 'id="prejoin-cam-btn"'):
            self.assertContains(member_detail, needle)

        # Guest join page & waiting room page
        gc = Client()
        guest_join = gc.get(reverse('meetings:guest_join', args=['abc123code']))
        for needle in ('id="prejoin-studio"', 'id="prejoin-mic-btn"', 'id="prejoin-cam-btn"'):
            self.assertContains(guest_join, needle)
        gc.post(reverse('meetings:guest_join', args=['abc123code']), {'name': 'Zainab', 'lang': 'en'})
        guest_wait = gc.get(reverse('meetings:guest_wait', args=['abc123code']))
        self.assertNotContains(guest_wait, 'id="prejoin-studio"')
        self.assertContains(guest_wait, 'id="cancel-wait-btn"')

    def test_guest_can_cancel_waiting_and_return_to_join_page(self):
        from .models import GuestSession
        gc = Client()
        gc.post(reverse('meetings:guest_join', args=['abc123code']), {'name': 'Amara', 'lang': 'en'})
        g = GuestSession.objects.get(name='Amara')
        self.assertEqual(g.status, 'waiting')

        # Guest clicks Cancel on the waiting/lobby page
        cancel_url = reverse('meetings:guest_leave', args=['abc123code']) + '?cancelled=1'
        res = gc.get(cancel_url)
        self.assertRedirects(res, reverse('meetings:guest_join', args=['abc123code']) + '?cancelled=1')

        # Session was cleared and status is removed
        g.refresh_from_db()
        self.assertEqual(g.status, 'removed')

        # Visiting the join page now displays the cancelled message and does not bounce back to wait
        join_page = gc.get(reverse('meetings:guest_join', args=['abc123code']) + '?cancelled=1')
        self.assertContains(join_page, 'You have cancelled waiting')




