"""Pure logic for the translation worker (no network): packets, targets, minutes."""
import json
import re
import uuid
from difflib import SequenceMatcher

from .languages import BOT_IDENTITY, LANGS


def caption_packet(speaker, lang, text, translations, final, seg=None, identity=None):
    """`lang` is the language the words were actually spoken in (detected by the interpreter); `identity` lets browsers
    route each speaker's original voice by that language rather than by the language the speaker listens in."""
    return json.dumps({'seg': seg or uuid.uuid4().hex[:8], 'speaker': speaker, 'identity': identity, 'lang': lang,
                       'text': text, 'translations': translations, 'final': final}).encode('utf-8')


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
# Whole sentences translate far better than fragments (word order, gender and agreement depend on the rest of the
# sentence), so a sentence is normally translated in one piece the moment the speaker pauses (the recogniser's 'final').
# Only a long run-on sentence is cut early, at a clause boundary when there is one, so listeners are never left waiting
# for someone who talks without pausing. Live recogniser hypotheses carry no punctuation, so clause boundaries are found
# before linking words ("and", "but", "parce que"...), which start a new clause in every language.
CHUNK_MIN_WORDS = 7      # never cut a run-on sentence into a piece shorter than this (too little context)
CHUNK_MAX_WORDS = 14     # with no clause boundary at all, cut after this many stable words
HOLD_BACK_WORDS = 1      # the recogniser only reports stable words (see agent.py); keep the very last one back anyway
CLAUSE_END = (',', '.', ';', ':', '?', '!', '…', '،', '؛', '؟')
BREAK_BEFORE = {
    'en': {'and', 'but', 'so', 'because', 'which', 'when', 'while', 'although', 'though', 'whereas', 'then', 'or'},
    'fr': {'et', 'mais', 'donc', 'car', 'parce', 'quand', 'lorsque', 'puis', 'ou', 'alors', 'tandis', 'pendant'},
    'pt': {'e', 'mas', 'então', 'porque', 'quando', 'enquanto', 'ou', 'pois', 'embora', 'depois'},
    'sw': {'na', 'lakini', 'kwamba', 'kwasababu', 'halafu', 'au', 'ingawa', 'wakati', 'kisha', 'ila'},
    'ar': {'لكن', 'لأن', 'عندما', 'ثم', 'أو', 'بينما', 'حيث', 'لذلك', 'ولكن', 'وعندما'},
}
_PUNCT = re.compile(r"[^\w']+", re.UNICODE)


def _norm(word):
    return _PUNCT.sub('', word.lower())


def next_chunk(text, committed, final=False, min_words=CHUNK_MIN_WORDS, max_words=CHUNK_MAX_WORDS,
               hold_back=HOLD_BACK_WORDS, lang=None):
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
    if cut is None:      # no punctuation (live hypotheses): cut just before the last linking word, if there is one
        links = BREAK_BEFORE.get(lang, ())
        for i in range(stable - 1, committed + min_words - 1, -1):
            if _norm(words[i]) in links:
                cut = i
                while cut - 1 >= committed + min_words and _norm(words[cut - 1]) in links:    # "and then", "mais donc"
                    cut -= 1
                break
    if cut is None and stable - committed >= max_words:
        cut = committed + max_words
    if cut is None:
        return '', committed
    return ' '.join(words[committed:cut]), cut


def remainder_after(final_text, sent_words):
    """The part of the recogniser's final sentence that was not already sent as an early chunk.

    The final text is formatted differently from the live hypotheses the chunks were cut from (punctuation, capitals,
    'twenty five' -> '25'), so counting words would drop or repeat some. Align the two instead and return what follows
    the last word already sent. When in doubt a word is repeated rather than lost."""
    final = (final_text or '').split()
    if not sent_words:
        return ' '.join(final)
    a, b = [_norm(w) for w in sent_words], [_norm(w) for w in final]
    end = None
    for blk in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        # ignore a chance match on a common word far ahead in the final sentence (that would skip what lies between)
        if blk.size and blk.b <= blk.a + 3:
            end = blk.b + blk.size
    if end is None:
        end = min(len(sent_words), len(final))
    return ' '.join(final[end:])


# Neural voices speak at roughly this many characters a second at the normal rate (used to estimate the queue length).
CHARS_PER_SECOND = 15.0


def speech_seconds(text):
    return len(text or '') / CHARS_PER_SECOND


def catch_up_rate(behind_seconds):
    """Speech-rate boost for the voice when earlier translations are still queued for this language (in seconds of
    audio), so the interpreter never falls far behind. Translations are often longer than what was said (French is ~20%
    longer than English), so without this the delay would keep growing during a long speech."""
    if behind_seconds >= 8:
        return '+30%'
    if behind_seconds >= 5:
        return '+20%'
    if behind_seconds >= 2.5:
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
