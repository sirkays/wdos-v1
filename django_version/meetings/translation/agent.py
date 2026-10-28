"""The interpreter bot. Joins a WODDI Room as `wdos-translator-bot` and, for every human who speaks:
   mic audio -> Azure Speech (their language) -> Azure Translator (each language the room listens in)
   -> captions over LiveKit data (`wdos_caption`) + a neural voice on one audio track per language (`lang:xx`).
   Phones only ever publish one normal microphone stream; all heavy work happens here.

   Interpretation is streamed: while a person is still talking, every few stable words are translated and voiced straight
   away (see logic.next_chunk), so listeners hear their own language a couple of seconds behind the speaker and the speaker
   never has to stop and wait. Nothing is ever translated into the speaker's own language, so they never hear themselves."""
import asyncio
import json
import logging
from datetime import timedelta

from asgiref.sync import sync_to_async
from django.conf import settings

from . import azure
from .languages import BOT_IDENTITY, CAPTION_TOPIC, STT_LOCALE, VOICE, can_speak
from .logic import caption_packet, catch_up_rate, next_chunk, participant_lang, target_languages

log = logging.getLogger(__name__)


class Superseded(ConnectionError):
    """Another interpreter instance joined this room with the same identity (a deploy overlap, or a second worker) and
    LiveKit removed this one. The supervisor must NOT rejoin straight away, or the two would keep kicking each other out."""


def bot_token(room):
    from livekit import api
    g = api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=True)
    return (api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(BOT_IDENTITY).with_name('Interpreter').with_grants(g).with_ttl(timedelta(hours=4)).to_jwt())


@sync_to_async
def _save(meeting_id, speaker, profile_id, lang, text, translations, seconds, tchars, schars):
    from django.db.models import F
    from meetings.models import TranscriptSegment, TranslationUsage
    TranscriptSegment.objects.create(meeting_id=meeting_id, speaker=speaker, speaker_profile_id=profile_id,
                                     lang=lang, text=text, translations=translations)
    u, _ = TranslationUsage.objects.get_or_create(meeting_id=meeting_id)
    TranslationUsage.objects.filter(pk=u.pk).update(audio_seconds=F('audio_seconds') + seconds,
                                                    translated_chars=F('translated_chars') + tchars,
                                                    spoken_chars=F('spoken_chars') + schars)


class Utterance:
    """Everything one person says between two recogniser 'final' results; chunks are collected so it is saved once."""

    def __init__(self):
        self.committed = 0      # words of the live hypothesis already sent for translation
        self.parts = []
        self.translations = {}
        self.tchars = 0
        self.schars = 0


class RoomBot:
    def __init__(self, meeting_id, room_name):
        self.meeting_id, self.room_name = meeting_id, room_name
        self.room = None
        self.tracks = {}      # lang -> AudioSource
        self.tasks = set()
        self.speech_q = {}    # lang -> asyncio.Queue of PCM for the TTS publisher
        self.listening = {}   # (identity, track sid) -> (task, language it is recognising, track, participant)
        self.retries = {}     # (identity, track sid) -> consecutive recogniser failures (reset on the first good result)

    # -- helpers ------------------------------------------------------------
    def _spawn(self, coro):
        t = asyncio.create_task(coro)
        self.tasks.add(t)
        t.add_done_callback(self._done)
        return t

    def _done(self, t):
        self.tasks.discard(t)
        if not t.cancelled() and t.exception():
            log.warning('interpreter task failed: %s', t.exception())

    def humans(self):
        out = [{'identity': self.room.local_participant.identity, 'metadata': ''}]
        out += [{'identity': p.identity, 'metadata': p.metadata} for p in self.room.remote_participants.values()]
        return [h for h in out if not h['identity'].startswith(BOT_IDENTITY)]

    async def source_for(self, lang):
        from livekit import rtc
        if lang in self.tracks:
            return self.tracks[lang]
        src = rtc.AudioSource(24000, 1)
        track = rtc.LocalAudioTrack.create_audio_track(f'lang:{lang}', src)
        await self.room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        self.tracks[lang] = src
        return src

    async def speak(self, lang, pcm):
        from livekit import rtc
        src = await self.source_for(lang)
        step = 480 * 2    # 20 ms of 24 kHz 16-bit mono
        for i in range(0, len(pcm), step):
            chunk = pcm[i:i + step]
            if len(chunk) < step:
                chunk += b'\x00' * (step - len(chunk))
            await src.capture_frame(rtc.AudioFrame(chunk, 24000, 1, 480))

    async def publish_caption(self, packet):
        await self.room.local_participant.publish_data(packet, reliable=True, topic=CAPTION_TOPIC)

    def enqueue_speech(self, lang, pcm):
        """Voices are played one chunk at a time per language, in the order they were produced (no overlapping audio)."""
        q = self.speech_q.get(lang)
        if q is None:
            q = self.speech_q[lang] = asyncio.Queue()
            self._spawn(self.playout(lang, q))
        q.put_nowait(pcm)

    async def playout(self, lang, q):
        while True:
            pcm = await q.get()
            try:
                await self.speak(lang, pcm)
            except Exception as exc:
                log.warning('playback failed: %s', exc)

    # -- one stretch of speech, chunk by chunk ------------------------------
    async def on_chunk(self, participant, lang, utt, text):
        name = participant.name or participant.identity
        # Languages of everyone in the room except the speaker's own: the speaker is never interpreted back to themselves.
        targets = target_languages(self.humans(), lang)
        try:
            tr = await asyncio.to_thread(azure.translate, text, lang, targets)
        except Exception as exc:    # a translation hiccup must never stop the call
            log.warning('translate failed: %s', exc)
            tr = {}
        await self.publish_caption(caption_packet(name, lang, text, tr, True))
        utt.parts.append(text)
        for t_lang, t_text in tr.items():
            utt.translations.setdefault(t_lang, []).append(t_text)
        utt.tchars += sum(len(v) for v in tr.values())

        async def voice(t_lang, t_text):
            backlog = self.speech_q[t_lang].qsize() if t_lang in self.speech_q else 0
            pcm = await asyncio.to_thread(azure.synthesize_pcm24k, t_text, t_lang, catch_up_rate(backlog))
            return t_lang, t_text, pcm

        for res in await asyncio.gather(*[voice(k, v) for k, v in tr.items() if k in VOICE], return_exceptions=True):
            if isinstance(res, Exception):
                log.warning('tts failed: %s', res)
                continue
            t_lang, t_text, pcm = res
            if pcm:
                utt.schars += len(t_text)
                self.enqueue_speech(t_lang, pcm)

    async def finish(self, participant, lang, utt, seconds):
        """The speaker paused: save what they said once, as a single transcript line."""
        if not utt.parts:
            return
        profile_id = participant.identity if len(participant.identity) == 36 else None
        await _save(self.meeting_id, participant.name or participant.identity, profile_id, lang, ' '.join(utt.parts),
                    {k: ' '.join(v) for k, v in utt.translations.items()}, seconds, utt.tchars, utt.schars)

    async def interpret(self, participant, lang, work):
        """One speaker's queue: chunks are translated and voiced in order while the speaker carries on talking."""
        while True:
            item = await work.get()
            if item is None:
                return
            try:
                if item[0] == 'chunk':
                    await self.on_chunk(participant, lang, item[1], item[2])
                else:
                    await self.finish(participant, lang, item[1], item[2])
            except Exception as exc:
                log.warning('interpretation step failed: %s', exc)

    # -- one speaker's microphone -------------------------------------------
    def start_listening(self, track, participant):
        key = (participant.identity, track.sid)
        old = self.listening.pop(key, None)
        if old:
            old[0].cancel()
        lang = participant_lang(participant.metadata)
        self.listening[key] = (self._spawn(self.listen(track, participant, lang)), lang, track, participant)

    async def listen(self, track, participant, lang):
        import azure.cognitiveservices.speech as speechsdk
        from livekit import rtc
        loop = asyncio.get_running_loop()
        if not can_speak(lang):
            log.info('%s speaks %s: no recogniser, not transcribed', participant.identity, lang)
            return
        cfg = speechsdk.SpeechConfig(subscription=settings.AZURE_SPEECH_KEY, region=settings.AZURE_SPEECH_REGION)
        cfg.speech_recognition_language = STT_LOCALE[lang]
        push = speechsdk.audio.PushAudioInputStream(speechsdk.audio.AudioStreamFormat(16000, 16, 1))
        rec = speechsdk.SpeechRecognizer(cfg, speechsdk.audio.AudioConfig(stream=push))
        name = participant.name or participant.identity
        work = asyncio.Queue()
        self._spawn(self.interpret(participant, lang, work))
        st = {'utt': Utterance()}

        # These three run on the event loop, so the chunk bookkeeping never races with the recogniser threads.
        def flush(text, final=False):
            utt = st['utt']
            while True:
                chunk, utt.committed = next_chunk(text, utt.committed, final)
                if chunk:
                    work.put_nowait(('chunk', utt, chunk))
                if not chunk or final:
                    return

        def on_interim(text):
            flush(text)
            tail = ' '.join(text.split()[st['utt'].committed:])
            if tail:    # live, untranslated words still being spoken; replaced in place as chunks are committed
                self._spawn(self.publish_caption(caption_packet(name, lang, tail, {}, False, f'live-{participant.identity}')))

        def on_final(text, secs):
            flush(text, True)
            work.put_nowait(('end', st['utt'], secs))
            st['utt'] = Utterance()

        def interim(evt):
            if evt.result.text:
                loop.call_soon_threadsafe(on_interim, evt.result.text)

        def final(evt):
            if evt.result.text.strip():
                secs = max(1, int(evt.result.duration / 10_000_000))
                loop.call_soon_threadsafe(on_final, evt.result.text, secs)

        # Azure ends a recogniser quietly when it refuses it (quota used up, throttled, bad key, network). Say so in the
        # log with Azure's own reason, and try again a few times, so one hiccup never leaves a speaker un-interpreted.
        key = (participant.identity, track.sid)

        def on_error(detail):
            log.error('speech recognition for %s (%s) stopped: %s', participant.identity, lang, detail)
            n = self.retries.get(key, 0)
            if n < 5:
                self.retries[key] = n + 1
                self._spawn(self.retry_listening(key, track, participant, 3 * (n + 1)))

        def canceled(evt):
            d = evt.cancellation_details
            if d.reason == speechsdk.CancellationReason.Error:
                loop.call_soon_threadsafe(on_error, f'{d.error_code}: {d.error_details}')

        def on_ok():
            self.retries.pop(key, None)

        rec.recognizing.connect(interim)
        rec.recognized.connect(lambda evt: (final(evt), loop.call_soon_threadsafe(on_ok)))
        rec.canceled.connect(canceled)
        # Starting the recogniser talks to Azure; keep that off the event loop so a slow answer cannot freeze every room.
        await asyncio.to_thread(lambda: rec.start_continuous_recognition_async().get())
        try:
            async for ev in rtc.AudioStream(track, sample_rate=16000, num_channels=1):
                push.write(ev.frame.data.tobytes())
        finally:
            push.close()
            # off the event loop, so the recogniser's last result is still delivered before the queue is closed
            await asyncio.to_thread(lambda: rec.stop_continuous_recognition_async().get())
            work.put_nowait(None)

    async def retry_listening(self, key, track, participant, delay):
        await asyncio.sleep(delay)
        if key in self.listening:       # only if that microphone is still in the room
            log.info('retrying speech recognition for %s', participant.identity)
            self.start_listening(track, participant)

    # -- lifecycle -----------------------------------------------------------
    async def run(self, stop):
        """Keep the interpreter in the room until `stop` is set. If the connection to the room is lost for good, raise so the
        supervisor starts a fresh bot (a bot that silently sits disconnected is the worst case: the room looks interpreted
        but nothing is translated)."""
        from livekit import rtc
        self.room = rtc.Room()
        dropped = asyncio.Event()
        superseded = []

        @self.room.on('disconnected')
        def _disc(reason=None, *_):
            if not stop.is_set():
                if reason == rtc.DisconnectReason.DUPLICATE_IDENTITY:
                    superseded.append(True)
                    log.warning('another interpreter took over %s; this one steps aside', self.room_name)
                else:
                    log.warning('interpreter lost its connection to %s (reason %s)', self.room_name, reason)
                dropped.set()

        @self.room.on('track_subscribed')
        def _sub(track, pub, participant):
            if track.kind == rtc.TrackKind.KIND_AUDIO and not participant.identity.startswith(BOT_IDENTITY):
                self.start_listening(track, participant)

        @self.room.on('track_unsubscribed')
        def _unsub(track, pub, participant):
            entry = self.listening.pop((participant.identity, track.sid), None)
            if entry:
                entry[0].cancel()

        @self.room.on('participant_metadata_changed')
        def _meta(participant, *_):
            # Someone changed the language they speak/hear: recognise them in the new language from now on, so what they
            # say is translated from the right source and is never voiced back into their own language.
            for key, (task, lang, track, p) in list(self.listening.items()):
                if p.identity == participant.identity and participant_lang(participant.metadata) != lang:
                    log.info('%s switched %s -> %s', p.identity, lang, participant_lang(participant.metadata))
                    self.start_listening(track, participant)

        def _want_audio(pub, participant):
            return (pub.kind == rtc.TrackKind.KIND_AUDIO and not participant.identity.startswith(BOT_IDENTITY))

        # The interpreter only needs people's microphones. With auto-subscribe off it never downloads the cameras and
        # screen shares of a big room (they would be pure wasted bandwidth/CPU on the worker); we subscribe to audio ourselves.
        @self.room.on('track_published')
        def _pub(pub, participant):
            if _want_audio(pub, participant):
                pub.set_subscribed(True)

        await self.room.connect(settings.LIVEKIT_URL, bot_token(self.room_name),
                                options=rtc.RoomOptions(auto_subscribe=False))
        for participant in self.room.remote_participants.values():     # people already speaking when the bot joins
            for pub in participant.track_publications.values():
                if _want_audio(pub, participant):
                    pub.set_subscribed(True)
        log.info('interpreter joined %s', self.room_name)
        # voice channels exist before anyone asks, so browsers can subscribe on arrival
        for lang in VOICE:
            await self.source_for(lang)
        waiters = [asyncio.ensure_future(stop.wait()), asyncio.ensure_future(dropped.wait())]
        await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
        for w in waiters:
            w.cancel()
        for t in list(self.tasks):
            t.cancel()
        try:
            await self.room.disconnect()
        except Exception as exc:
            log.warning('interpreter disconnect: %s', exc)
        if dropped.is_set() and not stop.is_set():
            if superseded:
                raise Superseded(f'another interpreter took over {self.room_name}')
            raise ConnectionError(f'interpreter lost its connection to {self.room_name}')
