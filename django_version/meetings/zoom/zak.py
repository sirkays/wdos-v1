from django.core.cache import caches
from ..models_zoom import ZoomHostAccount
from .client import ZoomClient

ZAK_CACHE_TTL = 90 * 60  # 90 minutes (Zoom ZAK tokens are valid for 2 hours)


def _cache():
    try:
        return caches['zoom']
    except Exception:
        return caches['default']


def zak_cache_key(zoom_user_id: str) -> str:
    return f'wdos:zoom:zak:{zoom_user_id}'


def get_host_zak(host: ZoomHostAccount | str, *, client: ZoomClient | None = None) -> str:
    """Fetch and cache the ZAK token for a Zoom host user for 90 minutes."""
    zoom_user_id = host.zoom_user_id if isinstance(host, ZoomHostAccount) else str(host)
    cache = _cache()
    key = zak_cache_key(zoom_user_id)
    cached = cache.get(key)
    if cached:
        return cached
    c = client or ZoomClient()
    token = c.get_user_zak(zoom_user_id)
    cache.set(key, token, timeout=ZAK_CACHE_TTL)
    return token


def invalidate_host_zak(host: ZoomHostAccount | str) -> None:
    zoom_user_id = host.zoom_user_id if isinstance(host, ZoomHostAccount) else str(host)
    _cache().delete(zak_cache_key(zoom_user_id))
