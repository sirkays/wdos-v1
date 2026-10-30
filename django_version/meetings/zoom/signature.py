import time
import jwt
from django.conf import settings
from django.core.cache import caches

from .client import ZoomAuthError

HOST_CLAIM_TTL = 3 * 3600  # 3 hours


def _cache():
    try:
        return caches['zoom']
    except Exception:
        return caches['default']


def make_sdk_signature(
    meeting_number: int | str,
    role: int,
    *,
    sdk_key: str | None = None,
    sdk_secret: str | None = None,
    ttl: int = 7200,
) -> str:
    """Generate an HS256 Meeting SDK JWT signature for Zoom Meeting SDK Web 6.10.0."""
    key = (sdk_key if sdk_key is not None else getattr(settings, 'ZOOM_SDK_KEY', '')) or ''
    secret = (sdk_secret if sdk_secret is not None else getattr(settings, 'ZOOM_SDK_SECRET', '')) or ''
    if not (key and secret):
        raise ZoomAuthError('Zoom Meeting SDK credentials (ZOOM_SDK_KEY / ZOOM_SDK_SECRET) are not configured.')

    role_int = 1 if int(role) == 1 else 0
    iat = int(time.time()) - 30
    exp = iat + max(1800, int(ttl))
    payload = {
        'appKey': key,
        'sdkKey': key,
        'mn': str(meeting_number),
        'role': role_int,
        'iat': iat,
        'exp': exp,
        'tokenExp': exp,
        'video_webrtc_mode': 1,
    }
    token = jwt.encode(payload, secret, algorithm='HS256', headers={'alg': 'HS256', 'typ': 'JWT'})
    return token if isinstance(token, str) else token.decode('utf-8')


def host_claim_key(meeting) -> str:
    pk = meeting.pk if hasattr(meeting, 'pk') else meeting
    return f'zoom:host:{pk}'


def get_host_claimant(meeting) -> str | None:
    val = _cache().get(host_claim_key(meeting))
    return str(val) if val else None


def claim_host_slot(meeting, profile) -> bool:
    """Atomically claim the single host/ZAK slot for a Zoom meeting (SET NX EX 3h).
    If the same manager already holds the claim (e.g. page reload), refreshes and returns True.
    """
    cache = _cache()
    key = host_claim_key(meeting)
    profile_id = str(profile.pk if hasattr(profile, 'pk') else profile)
    if cache.add(key, profile_id, timeout=HOST_CLAIM_TTL):
        return True
    current = cache.get(key)
    if current and str(current) == profile_id:
        cache.set(key, profile_id, timeout=HOST_CLAIM_TTL)
        return True
    return False


def release_host_claim(meeting, customer_key: str | None = None) -> bool:
    """Release the host slot for a meeting unconditionally (meeting ended) or if held by customer_key."""
    cache = _cache()
    key = host_claim_key(meeting)
    if customer_key is None:
        cache.delete(key)
        return True
    current = cache.get(key)
    if current and str(current) == str(customer_key):
        cache.delete(key)
        return True
    return False
