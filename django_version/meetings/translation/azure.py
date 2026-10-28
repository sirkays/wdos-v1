"""Azure AI Translator + Neural TTS over REST (small, testable, no SDK needed)."""
import logging

import requests
from django.conf import settings

from .languages import STT_LOCALE, VOICE

log = logging.getLogger(__name__)
TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate'
_session = requests.Session()


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


def translate(text, source, targets):
    """Return {lang: text} for every target that differs from the source. Tries the second key on a 401/403."""
    targets = [t for t in dict.fromkeys(targets) if t != source]
    if not text.strip() or not targets:
        return {}
    keys = _keys('AZURE_TRANSLATOR_KEY', 'AZURE_TRANSLATOR_KEY_2')
    if not keys:
        raise AzureNotConfigured('AZURE_TRANSLATOR_KEY')
    region = (settings.AZURE_TRANSLATOR_REGION or '').strip()
    params = [('api-version', '3.0'), ('from', source)] + [('to', t) for t in targets]
    for key in keys:
        headers = {'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json'}
        if region and region.lower() != 'global':
            headers['Ocp-Apim-Subscription-Region'] = region
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


def synthesize_pcm24k(text, lang, rate=None):
    """Raw 24 kHz 16-bit mono PCM, or None when this language has no neural voice. `rate` e.g. '+10%' speaks faster."""
    if lang not in VOICE or not text.strip():
        return None
    keys = _keys('AZURE_SPEECH_KEY', 'AZURE_SPEECH_KEY_2')
    if not keys or not settings.AZURE_SPEECH_REGION:
        raise AzureNotConfigured('AZURE_SPEECH_KEY')
    url = f'https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1'
    for key in keys:
        r = _session.post(url, data=_ssml(text, lang, rate).encode('utf-8'), timeout=15, headers={
            'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm', 'User-Agent': 'wdos-translator'})
        if r.status_code in (401, 403):
            continue
        r.raise_for_status()
        return r.content
    raise AzureNotConfigured('AZURE_SPEECH_KEY (rejected)')
