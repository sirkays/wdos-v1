from django.conf import settings

PINNED_SDK_VERSION = '6.10.0'

# Verified against https://source.zoom.us/6.10.0/ on 30 Oct 2026 (§4.1)
SRI_HASHES = {
    '6.10.0': {
        'react': 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
        'react_dom': 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
        'sdk': 'sha384-1TA5KeL1/rKHEvx0tJjN14hplm9AWAJsIMEeUjlxzHwx8JXQrNPY5GHzIhR3P3RA',
    },
}

ZOOM_LANG_MAP = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'pt': 'pt-PT',
    'es': 'es-ES',
    'de': 'de-DE',
    # Zoom Meeting SDK 6.10.0 does not ship Arabic or Swahili UI locales; map to en-US (§4.1)
    'ar': 'en-US',
    'sw': 'en-US',
}


def map_zoom_lang(lang: str | None) -> str:
    if not lang:
        return 'en-US'
    code = lang.strip().lower()[:2]
    return ZOOM_LANG_MAP.get(code, 'en-US')


def sdk_assets() -> dict:
    version = getattr(settings, 'ZOOM_SDK_VERSION', PINNED_SDK_VERSION) or PINNED_SDK_VERSION
    base = f'https://source.zoom.us/{version}'
    hashes = SRI_HASHES.get(version, {})
    return {
        'version': version,
        'react_url': f'{base}/lib/vendor/react.min.js',
        'react_sri': hashes.get('react', ''),
        'react_dom_url': f'{base}/lib/vendor/react-dom.min.js',
        'react_dom_sri': hashes.get('react_dom', ''),
        'sdk_url': f'{base}/zoom-meeting-{version}.min.js',
        'sdk_sri': hashes.get('sdk', ''),
    }
