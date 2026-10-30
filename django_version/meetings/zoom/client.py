import logging
import random
import time
import requests
from django.conf import settings
from django.core.cache import caches

logger = logging.getLogger(__name__)

S2S_TOKEN_CACHE_KEY = 'wdos:zoom:s2s_access_token'
S2S_TOKEN_LOCK_KEY = 'wdos:zoom:s2s_access_token:lock'

ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token'
ZOOM_API_BASE = 'https://api.zoom.us/v2'


class ZoomError(Exception):
    """Base exception for Zoom API errors."""

    def __init__(self, message: str, status_code: int | None = None, tracking_id: str = ''):
        super().__init__(message)
        self.status_code = status_code
        self.tracking_id = tracking_id


class ZoomAuthError(ZoomError):
    """Raised on 401/403 authentication or scope errors from Zoom."""


class ZoomRateLimited(ZoomError):
    """Raised when Zoom returns HTTP 429 after retries are exhausted."""


class ZoomNotFound(ZoomError):
    """Raised when a Zoom resource (meeting/user) is not found (HTTP 404)."""


class ZoomAllocationError(ZoomError):
    """Raised when no licensed ZoomHostAccount in the pool is available for the requested window/capacity."""


def _cache():
    try:
        return caches['zoom']
    except Exception:
        return caches['default']


class ZoomClient:
    """Pooled HTTP client for Zoom Server-to-Server OAuth REST API v2."""

    _shared_session: requests.Session | None = None

    def __init__(self, session: requests.Session | None = None, sleep_fn=time.sleep):
        if session is not None:
            self.session = session
        else:
            if ZoomClient._shared_session is None:
                s = requests.Session()
                adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=25)
                s.mount('https://', adapter)
                ZoomClient._shared_session = s
            self.session = ZoomClient._shared_session
        self._sleep = sleep_fn
        self.timeout = (5, 10)  # (connect, read) seconds

    def get_access_token(self, force_refresh: bool = False) -> str:
        cache = _cache()
        if not force_refresh:
            cached = cache.get(S2S_TOKEN_CACHE_KEY)
            if cached:
                return cached

        account_id = getattr(settings, 'ZOOM_ACCOUNT_ID', '')
        client_id = getattr(settings, 'ZOOM_S2S_CLIENT_ID', '')
        client_secret = getattr(settings, 'ZOOM_S2S_CLIENT_SECRET', '')
        if not (account_id and client_id and client_secret):
            raise ZoomAuthError('Zoom S2S OAuth credentials are not configured.')

        # Prevent thundering herd on token refresh
        got_lock = cache.add(S2S_TOKEN_LOCK_KEY, '1', timeout=10)
        if not got_lock and not force_refresh:
            for _ in range(10):
                self._sleep(0.05)
                cached = cache.get(S2S_TOKEN_CACHE_KEY)
                if cached:
                    return cached

        try:
            resp = self.session.post(
                ZOOM_OAUTH_URL,
                params={'grant_type': 'account_credentials', 'account_id': account_id},
                auth=(client_id, client_secret),
                timeout=self.timeout,
            )
            tracking_id = resp.headers.get('x-zm-trackingid', '')
            if resp.status_code in (400, 401, 403):
                logger.error('Zoom S2S token failure status=%s tracking_id=%s', resp.status_code, tracking_id)
                raise ZoomAuthError(
                    f'Zoom OAuth failed with HTTP {resp.status_code}',
                    status_code=resp.status_code,
                    tracking_id=tracking_id,
                )
            if resp.status_code >= 500:
                raise ZoomError(
                    f'Zoom OAuth server error HTTP {resp.status_code}',
                    status_code=resp.status_code,
                    tracking_id=tracking_id,
                )
            data = resp.json()
            token = data.get('access_token')
            if not token:
                raise ZoomAuthError('Zoom OAuth response did not include access_token.', tracking_id=tracking_id)
            expires_in = int(data.get('expires_in', 3600))
            ttl = max(60, expires_in - 300)
            cache.set(S2S_TOKEN_CACHE_KEY, token, timeout=ttl)
            return token
        except requests.RequestException as exc:
            logger.error('Zoom OAuth network error: %s', type(exc).__name__)
            raise ZoomError('Network error while requesting Zoom S2S token.') from exc
        finally:
            if got_lock:
                cache.delete(S2S_TOKEN_LOCK_KEY)

    def request(self, method: str, path: str, *, params=None, json_body=None) -> dict | None:
        url = f"{ZOOM_API_BASE}/{path.lstrip('/')}"
        refreshed_401 = False
        max_attempts = 3

        for attempt in range(1, max_attempts + 1):
            token = self.get_access_token(force_refresh=refreshed_401)
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
            }
            try:
                resp = self.session.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=json_body,
                    headers=headers,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                logger.warning('Zoom API network error method=%s path=%s attempt=%d', method, path, attempt)
                if attempt == max_attempts:
                    raise ZoomError(f'Network error calling Zoom API {method} {path}') from exc
                self._backoff(attempt)
                continue

            tracking_id = resp.headers.get('x-zm-trackingid', '')

            if resp.status_code == 401 and not refreshed_401:
                refreshed_401 = True
                _cache().delete(S2S_TOKEN_CACHE_KEY)
                continue

            if resp.status_code in (401, 403):
                logger.error(
                    'Zoom API auth error method=%s path=%s status=%d tracking_id=%s',
                    method,
                    path,
                    resp.status_code,
                    tracking_id,
                )
                raise ZoomAuthError(
                    f'Zoom API authorization failed ({resp.status_code})',
                    status_code=resp.status_code,
                    tracking_id=tracking_id,
                )

            if resp.status_code == 404:
                raise ZoomNotFound(
                    f'Zoom resource not found: {path}',
                    status_code=404,
                    tracking_id=tracking_id,
                )

            if resp.status_code == 429:
                retry_after = resp.headers.get('Retry-After')
                logger.warning(
                    'Zoom API rate limited method=%s path=%s attempt=%d tracking_id=%s',
                    method,
                    path,
                    attempt,
                    tracking_id,
                )
                if attempt == max_attempts:
                    raise ZoomRateLimited(
                        'Zoom API rate limit exceeded.',
                        status_code=429,
                        tracking_id=tracking_id,
                    )
                self._backoff(attempt, retry_after=retry_after)
                continue

            if resp.status_code >= 500:
                logger.warning(
                    'Zoom API 5xx method=%s path=%s status=%d attempt=%d tracking_id=%s',
                    method,
                    path,
                    resp.status_code,
                    attempt,
                    tracking_id,
                )
                if attempt == max_attempts:
                    raise ZoomError(
                        f'Zoom API server error ({resp.status_code})',
                        status_code=resp.status_code,
                        tracking_id=tracking_id,
                    )
                self._backoff(attempt)
                continue

            if resp.status_code >= 400:
                err_msg = f'Zoom API error ({resp.status_code})'
                try:
                    body = resp.json()
                    if body.get('message'):
                        err_msg = f"{err_msg}: {body['message']}"
                except Exception:
                    pass
                logger.error(
                    'Zoom API 4xx method=%s path=%s status=%d tracking_id=%s',
                    method,
                    path,
                    resp.status_code,
                    tracking_id,
                )
                raise ZoomError(err_msg, status_code=resp.status_code, tracking_id=tracking_id)

            if resp.status_code == 204 or not resp.content:
                return None
            return resp.json()

        raise ZoomError(f'Zoom API request failed after {max_attempts} attempts.')

    def _backoff(self, attempt: int, retry_after: str | None = None):
        if retry_after:
            try:
                wait = min(float(retry_after), 10.0)
                self._sleep(wait)
                return
            except ValueError:
                pass
        base = 0.25 * (2 ** (attempt - 1))
        jitter = random.uniform(0, 0.15)
        self._sleep(base + jitter)

    # Convenience methods
    def get_user(self, zoom_user_id: str) -> dict:
        return self.request('GET', f'/users/{zoom_user_id}') or {}

    def get_user_zak(self, zoom_user_id: str) -> str:
        data = self.request('GET', f'/users/{zoom_user_id}/token', params={'type': 'zak'}) or {}
        token = data.get('token', '')
        if not token:
            raise ZoomError('Zoom ZAK response did not contain a token.')
        return token

    def create_meeting(self, zoom_user_id: str, payload: dict) -> dict:
        return self.request('POST', f'/users/{zoom_user_id}/meetings', json_body=payload) or {}

    def get_meeting(self, zoom_meeting_id: int | str) -> dict:
        return self.request('GET', f'/meetings/{zoom_meeting_id}') or {}

    def update_meeting(self, zoom_meeting_id: int | str, payload: dict) -> None:
        self.request('PATCH', f'/meetings/{zoom_meeting_id}', json_body=payload)

    def end_meeting(self, zoom_meeting_id: int | str) -> None:
        self.request('PUT', f'/meetings/{zoom_meeting_id}/status', json_body={'action': 'end'})

    def delete_meeting(self, zoom_meeting_id: int | str) -> None:
        self.request(
            'DELETE',
            f'/meetings/{zoom_meeting_id}',
            params={'cancel_meeting_reminder': 'false'},
        )
