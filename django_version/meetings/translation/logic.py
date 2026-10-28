"""Pure logic for the translation worker (no network): packets, targets, minutes."""
import json
import uuid

from .languages import BOT_IDENTITY, LANGS


def caption_packet(speaker, lang, text, translations, final, seg=None):
    return json.dumps({'seg': seg or uuid.uuid4().hex[:8], 'speaker': speaker, 'lang': lang, 'text': text,
                       'translations': translations, 'final': final}).encode('utf-8')


def participant_lang(metadata, default='en'):
    try:
        lang = json.loads(metadata or '{}').get('lang', default)
    except (ValueError, AttributeError):
        lang = default
    return lang if lang in LANGS else default


def target_languages(participants, source):
    """Languages the room is listening in (other than the speaker's), from each human's metadata."""
    want = {participant_lang(p['metadata']) for p in participants if not p['identity'].startswith(BOT_IDENTITY)}
    return sorted(want - {source})


# ---- streaming interpretation ------------------------------------------------
# A recogniser only "finalises" a sentence when the speaker pauses. To let people keep talking while everyone else already
# hears them in their own language, we translate and voice the stable beginning of a still-growing sentence in small chunks.
CHUNK_MIN_WORDS = 4      # never send fewer words than this (too little context to translate well)
CHUNK_MAX_WORDS = 9      # without punctuation, send after this many stable words
HOLD_BACK_WORDS = 2      # the last words of a live hypothesis are still being revised by the recogniser
CLAUSE_END = (',', '.', ';', ':', '?', '!', '…', '،', '؛', '؟')


def next_chunk(text, committed, final=False, min_words=CHUNK_MIN_WORDS, max_words=CHUNK_MAX_WORDS,
               hold_back=HOLD_BACK_WORDS):
    """Decide what part of a growing recognition can be translated right now.

    `text` is the whole live hypothesis for the current utterance, `committed` how many of its words were already sent.
    Returns (chunk, committed_after); chunk is '' when it is too early. On `final` everything left is returned.
    """
    words = (text or '').split()
    if final:
        return ' '.join(words[committed:]), max(committed, len(words))
    stable = len(words) - hold_back
    if stable - committed < min_words:
        return '', committed
    cut = None
    for i in range(stable - 1, committed + min_words - 2, -1):     # prefer the last clause boundary we can trust
        if words[i].endswith(CLAUSE_END):
            cut = i + 1
            break
    if cut is None and stable - committed >= max_words:
        cut = committed + max_words
    if cut is None:
        return '', committed
    return ' '.join(words[committed:cut]), cut


def catch_up_rate(backlog):
    """Speech-rate boost for the voice when earlier chunks are still queued, so the interpreter never falls far behind."""
    if backlog >= 4:
        return '+20%'
    if backlog >= 2:
        return '+10%'
    return None


def draft_minutes(meeting, segments, attendees):
    """A transcript digest for the leader to edit and approve; it is not saved until she closes the meeting."""
    s = meeting.starts_at
    e = meeting.ends_at

    def _fmt(d):
        return f"{d:%A %d %B %Y}, {d.hour % 12 or 12}:{d:%M} {'AM' if d.hour < 12 else 'PM'} UTC"
    when = f'Starts: {_fmt(s)} · Ends: {_fmt(e)}' if s and e else (f'Starts: {_fmt(s)}' if s else 'No set time')
    lines = [f'MINUTES (draft from live transcript): {meeting.title}', when, '',
             'Present: ' + (', '.join(attendees) if attendees else 'not recorded'), '', 'Discussion:']
    lines += [f'- {s.speaker}: {s.text}' for s in segments]
    lines += ['', 'Decisions:', '- ', '', 'Actions (owner, due date):', '- ']
    return '\n'.join(lines)
