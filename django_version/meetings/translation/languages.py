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

# Recogniser locale -> WDOS language (the interpreter detects which of the five languages each sentence is spoken in).
LANG_OF_LOCALE = {loc.lower(): lang for lang, loc in STT_LOCALE.items()}

BOT_IDENTITY = 'wdos-translator-bot'
CAPTION_TOPIC = 'wdos_caption'


def can_speak(lang):
    return lang in STT_LOCALE


def can_voice(lang):
    return lang in VOICE


def lang_of_locale(locale, default=None):
    """'fr-FR' -> 'fr'. Anything unknown (None, 'Unknown', another locale) -> `default`."""
    loc = (locale or '').strip().lower()
    if loc in LANG_OF_LOCALE:
        return LANG_OF_LOCALE[loc]
    base = loc.split('-')[0]
    return base if base in LANGS else default
