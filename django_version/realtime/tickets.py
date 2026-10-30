import secrets
from django.core import signing
from django.core.cache import caches

TICKET_SALT = 'wdos.ws'
TICKET_MAX_AGE = 60
NONCE_TTL = 120


def _cache():
    try:
        return caches['zoom']
    except Exception:
        return caches['default']


def issue(scope: dict) -> str:
    """Issue a short-lived (60s), single-use signed WebSocket ticket.
    Expected scope keys: kind ('member'|'guest'), sub, meeting, role ('manager'|'member'|'guest'), optional code.
    """
    payload = {
        'kind': scope.get('kind', 'member'),
        'sub': str(scope.get('sub', '')),
        'meeting': str(scope.get('meeting', '')),
        'role': scope.get('role', 'member'),
        'nonce': secrets.token_urlsafe(16),
    }
    if 'code' in scope:
        payload['code'] = str(scope['code'])
    return signing.dumps(payload, salt=TICKET_SALT)


def consume(token: str, max_age: int = TICKET_MAX_AGE) -> dict | None:
    """Validate and consume a single-use WebSocket ticket. Returns the payload dict or None."""
    if not token or not isinstance(token, str):
        return None
    try:
        payload = signing.loads(token, salt=TICKET_SALT, max_age=max_age)
    except signing.BadSignature:
        return None
    if not isinstance(payload, dict):
        return None
    nonce = payload.get('nonce')
    if not nonce:
        return None
    nonce_key = f'ws:nonce:{nonce}'
    if not _cache().add(nonce_key, '1', timeout=NONCE_TTL):
        return None
    return payload
