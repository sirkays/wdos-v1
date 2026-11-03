import json
import time
from urllib.parse import parse_qs
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .tickets import consume

MAX_INBOUND_BYTES = 1024
MAX_MSGS_PER_SEC = 5

# consume() does a (Redis) cache write; never run that on the event loop or one slow call stalls every open socket.
_consume_async = sync_to_async(consume, thread_sensitive=False)


def _extract_ticket(scope) -> str:
    raw_qs = scope.get('query_string', b'') or b''
    if isinstance(raw_qs, bytes):
        raw_qs = raw_qs.decode('utf-8', errors='ignore')
    params = parse_qs(raw_qs)
    vals = params.get('ticket') or []
    return vals[0] if vals else ''


class _BaseWdosConsumer(AsyncJsonWebsocketConsumer):
    groups_joined: list[str] = []
    _msg_timestamps: list[float] = []

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        raw = text_data if text_data is not None else (bytes_data.decode('utf-8', errors='ignore') if bytes_data else '')
        if len(raw.encode('utf-8')) > MAX_INBOUND_BYTES:
            await self.close(code=4413)
            return

        now = time.monotonic()
        self._msg_timestamps = [t for t in self._msg_timestamps if now - t < 1.0]
        if len(self._msg_timestamps) >= MAX_MSGS_PER_SEC:
            await self.close(code=4429)
            return
        self._msg_timestamps.append(now)

        try:
            content = json.loads(raw) if raw else {}
        except Exception:
            return
        if isinstance(content, dict) and content.get('type') == 'ping':
            await self.send_json({'type': 'pong'})

    async def wdos_event(self, message):
        payload = message.get('payload')
        if payload:
            await self.send_json(payload)

    async def disconnect(self, close_code):
        if self.channel_layer:
            for grp in getattr(self, 'groups_joined', []):
                await self.channel_layer.group_discard(grp, self.channel_name)
        self.groups_joined = []


class MeetingConsumer(_BaseWdosConsumer):
    """WebSocket consumer at /ws/meetings/<uuid>/ for signed-in members and managers."""

    async def connect(self):
        self.groups_joined = []
        self._msg_timestamps = []
        url_pk = str(self.scope.get('url_route', {}).get('kwargs', {}).get('pk', ''))
        token = _extract_ticket(self.scope)
        ticket = await _consume_async(token)

        await self.accept()
        if not ticket or ticket.get('kind') != 'member':
            await self.close(code=4401)
            return
        if str(ticket.get('meeting', '')) != url_pk:
            await self.close(code=4403)
            return

        base_group = f'mtg.{url_pk}'
        await self.channel_layer.group_add(base_group, self.channel_name)
        self.groups_joined.append(base_group)

        if ticket.get('role') == 'manager':
            host_group = f'mtg.{url_pk}.hosts'
            await self.channel_layer.group_add(host_group, self.channel_name)
            self.groups_joined.append(host_group)


class GuestLobbyConsumer(_BaseWdosConsumer):
    """WebSocket consumer at /ws/guest/<code>/ for waiting or admitted guests."""

    async def connect(self):
        self.groups_joined = []
        self._msg_timestamps = []
        url_code = str(self.scope.get('url_route', {}).get('kwargs', {}).get('code', ''))
        token = _extract_ticket(self.scope)
        ticket = await _consume_async(token)

        await self.accept()
        if not ticket or ticket.get('kind') != 'guest':
            await self.close(code=4401)
            return
        expected_code = ticket.get('code')
        if expected_code is not None and str(expected_code) != url_code:
            await self.close(code=4403)
            return

        gid = str(ticket.get('sub', ''))
        if not gid:
            await self.close(code=4401)
            return

        guest_group = f'guest.{gid}'
        await self.channel_layer.group_add(guest_group, self.channel_name)
        self.groups_joined.append(guest_group)
