"""The five WDOS speech languages supported by Azure AI Speech and Neural TTS."""
LANGS = ('en', 'fr', 'pt', 'ar', 'sw')

# Speech-to-text locales (all 5 languages supported for full two-way recognition).
STT_LOCALE = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'pt': 'pt-BR',
    'ar': 'ar-EG',
    'sw': 'sw-KE',
}

# Neural voices for real-time spoken translation (all 5 languages supported).
VOICE = {
    'en': 'en-US-JennyNeural',
    'fr': 'fr-FR-DeniseNeural',
    'pt': 'pt-BR-FranciscaNeural',
    'ar': 'ar-EG-SalmaNeural',
    'sw': 'sw-KE-ZuriNeural',
}

BOT_IDENTITY = 'wdos-translator-bot'
CAPTION_TOPIC = 'wdos_caption'


def can_speak(lang):
    return lang in STT_LOCALE


def can_voice(lang):
    return lang in VOICE
