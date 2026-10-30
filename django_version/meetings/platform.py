from django.conf import settings
from django.core.cache import caches

from .models_zoom import VideoPlatformSettings, ZoomHostAccount

CACHE_ALIAS = 'zoom'
PROVIDER_CACHE_KEY = 'wdos:video_platform:active_provider'
PROVIDER_CACHE_TTL = 60

REQUIRED_ZOOM_ENV_VARS = (
    'ZOOM_ACCOUNT_ID',
    'ZOOM_S2S_CLIENT_ID',
    'ZOOM_S2S_CLIENT_SECRET',
    'ZOOM_SDK_KEY',
    'ZOOM_SDK_SECRET',
    'ZOOM_WEBHOOK_SECRET_TOKEN',
    'ZOOM_FIELD_ENCRYPTION_KEY',
)


def _cache():
    try:
        return caches[CACHE_ALIAS]
    except Exception:
        return caches['default']


def missing_zoom_settings() -> list[str]:
    missing = []
    for name in REQUIRED_ZOOM_ENV_VARS:
        val = getattr(settings, name, '') or ''
        if not str(val).strip():
            missing.append(name)
    return missing


def active_hosts_count() -> int:
    try:
        return ZoomHostAccount.objects.filter(is_active=True).count()
    except Exception:
        return 0


def active_provider() -> str:
    """Return 'livekit' or 'zoom', cached for 60s and invalidated when VideoPlatformSettings is saved."""
    cache = _cache()
    cached = cache.get(PROVIDER_CACHE_KEY)
    if cached in ('livekit', 'zoom'):
        return cached
    try:
        cfg = VideoPlatformSettings.load()
        provider = cfg.active_provider if cfg.active_provider in ('livekit', 'zoom') else 'livekit'
    except Exception:
        provider = 'livekit'
    cache.set(PROVIDER_CACHE_KEY, provider, PROVIDER_CACHE_TTL)
    return provider


def invalidate_provider_cache() -> None:
    _cache().delete(PROVIDER_CACHE_KEY)
