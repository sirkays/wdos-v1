"""Azure AI Translator + Neural TTS over REST (small, testable, no SDK needed).

The interpreter bot uses the async variants (`translate_async`, `synthesize_stream`): they share one keep-alive
connection pool on the bot's event loop instead of tying up a worker thread per request (a small server has only a
handful of threads, and a busy room would queue every translation behind them), and the voice is streamed so listeners
start hearing a sentence while the rest of it is still being synthesised."""
import logging

import requests
from django.conf import settings

from .languages import STT_LOCALE, VOICE

log = logging.getLogger(__name__)
TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate'
_session = requests.Session()
_aio = None    # aiohttp.ClientSession of the interpreter's event loop (created on first use)


class AzureNotConfigured(RuntimeError):
    pass


def missing():
    out = []
    if not settings.AZURE_SPEECH_KEY:
        out.append('AZURE_SPEECH_KEY')
    if not settings.AZURE_SPEECH_REGION:
        out.append('AZURE_SPEECH_REGION')
    if not settings.AZURE_TRANSLATOR_KEY:
        out.append('AZURE_TRANSLATOR_KEY')
    return out


def _keys(*names):
    return [k for k in (getattr(settings, n, '') for n in names) if k]


def _translate_request(source, targets):
    targets = [t for t in dict.fromkeys(targets) if t != source]
    keys = _keys('AZURE_TRANSLATOR_KEY', 'AZURE_TRANSLATOR_KEY_2')
    if not keys:
        raise AzureNotConfigured('AZURE_TRANSLATOR_KEY')
    region = (settings.AZURE_TRANSLATOR_REGION or '').strip()
    params = [('api-version', '3.0'), ('from', source)] + [('to', t) for t in targets]
    headers = []
    for key in keys:
        h = {'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json'}
        if region and region.lower() != 'global':
            h['Ocp-Apim-Subscription-Region'] = region
        headers.append(h)
    return params, headers


def translate(text, source, targets):
    """Return {lang: text} for every target that differs from the source. Tries the second key on a 401/403."""
    targets = [t for t in dict.fromkeys(targets) if t != source]
    if not text.strip() or not targets:
        return {}
    params, all_headers = _translate_request(source, targets)
    for headers in all_headers:
        r = _session.post(TRANSLATE_URL, params=params, headers=headers, json=[{'Text': text}], timeout=10)
        if r.status_code in (401, 403):
            continue
        r.raise_for_status()
        return {t['to']: t['text'] for t in r.json()[0]['translations']}
    raise AzureNotConfigured('AZURE_TRANSLATOR_KEY (rejected)')


def _ssml(text, lang, rate=None):
    esc = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    if rate:
        esc = f"<prosody rate='{rate}'>{esc}</prosody>"
    loc = STT_LOCALE[lang]
    return f"<speak version='1.0' xml:lang='{loc}'><voice xml:lang='{loc}' name='{VOICE[lang]}'>{esc}</voice></speak>"


def _tts_request():
    keys = _keys('AZURE_SPEECH_KEY', 'AZURE_SPEECH_KEY_2')
    if not keys or not settings.AZURE_SPEECH_REGION:
        raise AzureNotConfigured('AZURE_SPEECH_KEY')
    url = f'https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1'
    return url, [{'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                  'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm', 'User-Agent': 'wdos-translator'}
                 for key in keys]


def synthesize_pcm24k(text, lang, rate=None):
    """Raw 24 kHz 16-bit mono PCM, or None when this language has no neural voice. `rate` e.g. '+10%' speaks faster."""
    if lang not in VOICE or not text.strip():
        return None
    url, all_headers = _tts_request()
    for headers in all_headers:
        r = _session.post(url, data=_ssml(text, lang, rate).encode('utf-8'), timeout=15, headers=headers)
        if r.status_code in (401, 403):
            continue
        r.raise_for_status()
        return r.content
    raise AzureNotConfigured('AZURE_SPEECH_KEY (rejected)')


# ---- async (interpreter bot) ------------------------------------------------
def aio_session():
    """One pooled, keep-alive HTTP session for the running event loop: no new TLS handshake per sentence."""
    global _aio
    import aiohttp
    if _aio is None or _aio.closed:
        _aio = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20, sock_connect=5),
                                     connector=aiohttp.TCPConnector(limit=100, keepalive_timeout=120))
    return _aio


async def close_session():
    global _aio
    if _aio is not None and not _aio.closed:
        await _aio.close()
    _aio = None


async def translate_async(text, source, targets):
    """Same contract as `translate`, without blocking a thread."""
    targets = [t for t in dict.fromkeys(targets) if t != source]
    if not text.strip() or not targets:
        return {}
    params, all_headers = _translate_request(source, targets)
    s = aio_session()
    for headers in all_headers:
        async with s.post(TRANSLATE_URL, params=params, headers=headers, json=[{'Text': text}]) as r:
            if r.status in (401, 403):
                continue
            r.raise_for_status()
            js = await r.json()
            return {t['to']: t['text'] for t in js[0]['translations']}
    raise AzureNotConfigured('AZURE_TRANSLATOR_KEY (rejected)')


async def synthesize_stream(text, lang, rate=None, chunk_bytes=4800):
    """Yield raw 24 kHz 16-bit mono PCM as Azure produces it (the first audio arrives long before the whole sentence
    is synthesised). Yields nothing when this language has no neural voice."""
    if lang not in VOICE or not text.strip():
        return
    url, all_headers = _tts_request()
    s = aio_session()
    body = _ssml(text, lang, rate).encode('utf-8')
    for headers in all_headers:
        async with s.post(url, data=body, headers=headers) as r:
            if r.status in (401, 403):
                continue
            r.raise_for_status()
            async for chunk in r.content.iter_chunked(chunk_bytes):
                yield chunk
            return
    raise AzureNotConfigured('AZURE_SPEECH_KEY (rejected)')
