"""The interpreter bot. Joins a WODDI Room as `wdos-translator-bot` and, for every human who speaks:
   mic audio -> Azure Speech (detects which of the five languages is spoken) -> Azure Translator (each language the room
   listens in) -> captions over LiveKit data (`wdos_caption`) + a neural voice on one audio track per language (`lang:xx`).
   Phones only ever publish one normal microphone stream; all heavy work happens here.

   Accuracy first: a sentence is translated whole, the moment the speaker pauses (whole sentences translate far better
   than fragments). Only a long run-on sentence is cut early, at a clause boundary (see logic.next_chunk), so nobody waits
   for a speaker who never pauses. The language is detected per sentence, so someone who listens in French but speaks
   English is still understood (the room's language picker is the language a person HEARS in).

   Speed: translation and voices never block a thread (async HTTP on one keep-alive pool), each voice is queued for
   playback the moment its sentence is translated and streamed while Azure is still synthesising it, and the next
   sentence is already being translated while the previous one plays. A voice that falls behind speaks faster, and one
   that falls very far behind skips queued sentences (captions keep every word) rather than lagging for the rest of the
   meeting. Nothing is ever translated into the language it was spoken in, so a speaker never hears themselves."""
import asyncio
import logging
from collections import deque
from datetime import timedelta

from asgiref.sync import sync_to_async
from django.conf import settings

from . import azure
from .languages import BOT_IDENTITY, CAPTION_TOPIC, LANGS, STT_LOCALE, VOICE, can_speak, lang_of_locale
from .logic import (caption_packet, catch_up_rate, next_chunk, participant_lang, remainder_after, speech_seconds,
                    target_languages)

log = logging.getLogger(__name__)

FRAME_BYTES = 480 * 2          # 20 ms of 24 kHz 16-bit mono
MAX_BEHIND_SECONDS = 20        # a language's voice this far behind skips queued sentences (captions still show them)
STABLE_PARTIAL_THRESHOLD = 3   # live hypotheses only report words the recogniser has stopped revising


def _setting(name, default):
    return getattr(settings, name, default)


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
        self.sent = []          # those words, to find what the final sentence adds (see logic.remainder_after)
        self.lang = None        # language it was spoken in (detected)
        self.parts = []
        self.translations = {}
        self.tchars = 0
        self.schars = 0


class Speech:
    """One translated piece for one language. It takes its place in the playback queue the moment it is translated (so
    order is kept) and is filled with audio while Azure is still synthesising it."""

    def __init__(self, text):
        self.text = text
        self.est = speech_seconds(text)
        self.played = 0.0
        self.dropped = False
        self.q = asyncio.Queue()

    def left(self):
        return max(0.0, self.est - self.played)


class RoomBot:
    def __init__(self, meeting_id, room_name):
        self.meeting_id, self.room_name = meeting_id, room_name
        self.room = None
        self.tracks = {}      # lang -> AudioSource
        self.tasks = set()
        self.waiting = {}     # lang -> deque of Speech waiting to be played
        self.playing = {}     # lang -> Speech being played now
        self.wake = {}        # lang -> asyncio.Event set when something is queued
        self.listening = {}   # (identity, track sid) -> (task, language it is recognising, track, participant)
        self.retries = {}     # (identity, track sid) -> consecutive recogniser failures (reset on the first good result)
        self.auto_detect = bool(_setting('INTERPRETER_AUTO_DETECT', True))

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

    async def publish_caption(self, packet):
        await self.room.local_participant.publish_data(packet, reliable=True, topic=CAPTION_TOPIC)

    # -- voices: one ordered playback queue per language ---------------------
    def behind(self, lang):
        """Seconds of translated speech still to be heard in this language."""
        cur = self.playing.get(lang)
        return (cur.left() if cur else 0.0) + sum(s.est for s in self.waiting.get(lang, ()))

    def queue_speech(self, lang, sp):
        """Voices are played one piece at a time per language, in the order they were translated (no overlapping audio)."""
        if lang not in self.waiting:
            self.waiting[lang], self.wake[lang] = deque(), asyncio.Event()
            self._spawn(self.playout(lang))
        w = self.waiting[lang]
        w.append(sp)
        while len(w) > 1 and self.behind(lang) > MAX_BEHIND_SECONDS:
            old = w.popleft()
            old.dropped = True
            log.warning('%s voice is %.0fs behind; skipped "%s"', lang, self.behind(lang) + old.est, old.text[:60])
        self.wake[lang].set()

    async def playout(self, lang):
        src = await self.source_for(lang)
        w, wake = self.waiting[lang], self.wake[lang]
        while True:
            if not w:
                wake.clear()
                await wake.wait()
                continue
            sp = w.popleft()
            self.playing[lang] = sp
            try:
                await self.play(src, sp)
            except Exception as exc:
                log.warning('playback failed: %s', exc)
            finally:
                self.playing.pop(lang, None)

    async def play(self, src, sp):
        """Push one piece to its language track as its audio streams in (real-time paced by the AudioSource)."""
        from livekit import rtc
        buf = b''
        while True:
            try:
                pcm = await asyncio.wait_for(sp.q.get(), timeout=10)
            except asyncio.TimeoutError:
                log.warning('voice for "%s" never arrived; skipped', sp.text[:60])
                return
            if pcm is None:
                break
            buf += pcm
            n = len(buf) - len(buf) % FRAME_BYTES
            for i in range(0, n, FRAME_BYTES):
                await src.capture_frame(rtc.AudioFrame(buf[i:i + FRAME_BYTES], 24000, 1, 480))
                sp.played += 0.02
            buf = buf[n:]
        if buf:
            buf += b'\x00' * (FRAME_BYTES - len(buf))
            await src.capture_frame(rtc.AudioFrame(buf, 24000, 1, 480))

    async def synth(self, sp, lang, text, rate):
        gen = azure.synthesize_stream(text, lang, rate)
        try:
            async for pcm in gen:
                if sp.dropped:
                    break
                sp.q.put_nowait(pcm)
        except Exception as exc:    # a voice hiccup must never stop the call; the caption still shows the words
            log.warning('tts failed (%s): %s', lang, exc)
        finally:
            await gen.aclose()      # releases the HTTP connection straight away when a skipped piece stops early
            sp.q.put_nowait(None)

    async def translate(self, text, lang, targets):
        for attempt in range(2):    # one quick retry: a dropped request must not lose a whole sentence
            try:
                return await azure.translate_async(text, lang, targets)
            except azure.AzureNotConfigured as exc:
                log.warning('translate failed: %s', exc)
                return {}
            except Exception as exc:
                log.warning('translate failed%s: %s', ' (retrying)' if attempt == 0 else '', exc)
                if attempt == 0:
                    await asyncio.sleep(0.2)
        return {}

    # -- one sentence (or one piece of a long one) --------------------------
    async def on_chunk(self, participant, lang, utt, text):
        name = participant.name or participant.identity
        # Languages of everyone in the room except the one this was spoken in: nobody hears it voiced in its own language.
        targets = target_languages(self.humans(), lang)
        tr = await self.translate(text, lang, targets)
        # Voices first: synthesis starts straight away and each piece takes its place in its language's queue.
        for t_lang, t_text in tr.items():
            if t_lang in VOICE and t_text.strip():
                sp = Speech(t_text)
                rate = catch_up_rate(self.behind(t_lang))
                self.queue_speech(t_lang, sp)
                self._spawn(self.synth(sp, t_lang, t_text, rate))
                utt.schars += len(t_text)
        utt.parts.append(text)
        for t_lang, t_text in tr.items():
            utt.translations.setdefault(t_lang, []).append(t_text)
        utt.tchars += sum(len(v) for v in tr.values())
        await self.publish_caption(caption_packet(name, lang, text, tr, True, identity=participant.identity))

    async def finish(self, participant, lang, utt, seconds):
        """The speaker paused: save what they said once, as a single transcript line."""
        if not utt.parts:
            return
        profile_id = participant.identity if len(participant.identity) == 36 else None
        await _save(self.meeting_id, participant.name or participant.identity, profile_id, lang, ' '.join(utt.parts),
                    {k: ' '.join(v) for k, v in utt.translations.items()}, seconds, utt.tchars, utt.schars)

    async def interpret(self, participant, lang, work):
        """One speaker's queue: pieces are translated in order while the speaker carries on talking (their voices are
        synthesised and played in the background, so the next sentence never waits for the previous one's audio)."""
        while True:
            item = await work.get()
            if item is None:
                return
            try:
                if item[0] == 'chunk':
                    await self.on_chunk(participant, item[3], item[1], item[2])
                else:
                    await self.finish(participant, item[1].lang or lang, item[1], item[2])
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

    def recognizer(self, lang, push):
        """A continuous recogniser for one microphone. `lang` (the language the person listens in) is the first guess;
        with detection on, each sentence is recognised in whichever of the five languages is actually spoken."""
        import azure.cognitiveservices.speech as speechsdk
        P = speechsdk.PropertyId
        cfg = speechsdk.SpeechConfig(subscription=settings.AZURE_SPEECH_KEY, region=settings.AZURE_SPEECH_REGION)
        cfg.set_profanity(speechsdk.ProfanityOption.Raw)     # never translate or voice '****'
        # End a sentence after this much quiet (the old room cut sentences on ~0.5 s of silence too).
        cfg.set_property(P.Speech_SegmentationSilenceTimeoutMs, str(int(_setting('INTERPRETER_SILENCE_MS', 500))))
        cfg.set_property(P.SpeechServiceResponse_StablePartialResultThreshold, str(STABLE_PARTIAL_THRESHOLD))
        audio = speechsdk.audio.AudioConfig(stream=push)
        auto = self.auto_detect
        if auto:
            cfg.set_property(P.SpeechServiceConnection_LanguageIdMode, 'Continuous')
            cands = [STT_LOCALE[lang]] + [STT_LOCALE[x] for x in LANGS if x != lang]
            detect = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(languages=cands)
            rec = speechsdk.SpeechRecognizer(speech_config=cfg, auto_detect_source_language_config=detect,
                                             audio_config=audio)
        else:
            cfg.speech_recognition_language = STT_LOCALE[lang]
            rec = speechsdk.SpeechRecognizer(speech_config=cfg, audio_config=audio)

        def spoken(result):
            if not auto:
                return lang
            try:
                return lang_of_locale(speechsdk.AutoDetectSourceLanguageResult(result).language, lang)
            except Exception:
                return lang
        return rec, spoken, auto

    async def listen(self, track, participant, lang):
        import azure.cognitiveservices.speech as speechsdk
        from livekit import rtc
        loop = asyncio.get_running_loop()
        if not can_speak(lang):
            log.info('%s speaks %s: no recogniser, not transcribed', participant.identity, lang)
            return
        push = speechsdk.audio.PushAudioInputStream(speechsdk.audio.AudioStreamFormat(16000, 16, 1))
        rec, spoken, auto = self.recognizer(lang, push)
        name = participant.name or participant.identity
        work = asyncio.Queue()
        self._spawn(self.interpret(participant, lang, work))
        st = {'utt': Utterance(), 'ok': False}

        # These run on the event loop, so the chunk bookkeeping never races with the recogniser threads.
        def on_interim(text, s_lang):
            utt = st['utt']
            if utt.lang is None:
                utt.lang = s_lang
            if s_lang == utt.lang:      # a language switch mid-sentence restarts the hypothesis: wait for the final
                while True:
                    chunk, utt.committed = next_chunk(text, utt.committed, lang=s_lang)
                    if not chunk:
                        break
                    utt.sent.extend(chunk.split())
                    work.put_nowait(('chunk', utt, chunk, s_lang))
            tail = ' '.join(text.split()[utt.committed:])
            if tail:    # live, untranslated words still being spoken; replaced in place as pieces are translated
                self._spawn(self.publish_caption(caption_packet(name, s_lang, tail, {}, False, f'live-{participant.identity}',
                                                                identity=participant.identity)))

        def on_final(text, secs, s_lang):
            utt = st['utt']
            # Pieces already sent in another language were a misheard start: the final is re-recognised, send it whole.
            rest = remainder_after(text, utt.sent) if utt.lang in (None, s_lang) else text
            utt.lang = s_lang
            if rest.strip():
                work.put_nowait(('chunk', utt, rest, s_lang))
            work.put_nowait(('end', utt, secs))
            st['utt'] = Utterance()

        def interim(evt):
            if evt.result.text:
                loop.call_soon_threadsafe(on_interim, evt.result.text, spoken(evt.result))

        def final(evt):
            if evt.result.text.strip():
                secs = max(1, int(evt.result.duration / 10_000_000))
                loop.call_soon_threadsafe(on_final, evt.result.text, secs, spoken(evt.result))

        # Azure ends a recogniser quietly when it refuses it (quota used up, throttled, bad key, network). Say so in the
        # log with Azure's own reason, and try again a few times, so one hiccup never leaves a speaker un-interpreted.
        key = (participant.identity, track.sid)

        def on_error(detail):
            log.error('speech recognition for %s (%s) stopped: %s', participant.identity, lang, detail)
            if auto and not st['ok'] and self.auto_detect:
                # Refused before it ever heard anything: recognise people in the language they chose instead.
                self.auto_detect = False
                log.warning('language detection unavailable in %s; recognising each speaker in their chosen language',
                            self.room_name)
            n = self.retries.get(key, 0)
            if n < 5:
                self.retries[key] = n + 1
                self._spawn(self.retry_listening(key, track, participant, 3 * (n + 1)))

        def canceled(evt):
            d = evt.cancellation_details
            if d.reason == speechsdk.CancellationReason.Error:
                loop.call_soon_threadsafe(on_error, f'{d.error_code}: {d.error_details}')

        def on_ok():
            st['ok'] = True
            self.retries.pop(key, None)

        rec.recognizing.connect(lambda evt: (interim(evt), loop.call_soon_threadsafe(on_ok)))
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
