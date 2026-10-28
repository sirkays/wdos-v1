"""LiveKit helpers: one room per meeting, one signed token per person."""
import json
from datetime import timedelta

from django.conf import settings


def missing_settings():
    return [k for k in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET') if not getattr(settings, k, '')]


def room_name(meeting):
    return f'meeting-{meeting.pk}'


def make_token(user, meeting, moderator, language='en'):
    """Everyone may publish and subscribe (they join muted, as listeners). Moderators are room admins."""
    from livekit import api
    grants = api.VideoGrants(room_join=True, room=room_name(meeting), can_publish=True, can_subscribe=True,
                             can_publish_data=True, can_update_own_metadata=True,
                             room_admin=bool(moderator))
    return (api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(str(user.pk)).with_name(user.full_name or user.email)
            .with_metadata(json.dumps({'lang': language, 'moderator': bool(moderator)}))
            .with_grants(grants).with_ttl(timedelta(hours=3)).to_jwt())


def make_guest_token(guest, meeting):
    """Guests: no admin rights, join muted, may speak, share their screen and chat. Name is marked (Guest).
    Data publishing is on so guests can chat; clients ignore host commands and captions from anyone but the
    moderators / the interpreter (see room.js), so a guest cannot spoof either."""
    from livekit import api
    grants = api.VideoGrants(room_join=True, room=room_name(meeting), can_publish=True, can_subscribe=True,
                             can_publish_data=True, can_update_own_metadata=True)
    return (api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(guest.identity).with_name(f'{guest.name} (Guest)')
            .with_metadata(json.dumps({'lang': guest.lang, 'moderator': False, 'guest': True}))
            .with_grants(grants).with_ttl(timedelta(hours=3)).to_jwt())


def remove_participant(meeting, identity):
    """Kick someone out of the live room. Best effort: the database status already blocks a re-join."""
    import asyncio
    from livekit import api

    async def go():
        lk = api.LiveKitAPI(settings.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://'),
                            settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        try:
            await lk.room.remove_participant(api.RoomParticipantIdentity(room=room_name(meeting), identity=identity))
        finally:
            await lk.aclose()
    try:
        asyncio.run(go())
        return True
    except Exception:
        return False


def lobby_room_name(meeting):
    """Waiting guests sit in their own room so they never see (or are seen by) the real meeting."""
    return f'lobby-{meeting.pk}'


def make_lobby_token(guest, meeting):
    """Listen-only, hidden token: the waiting guest can receive server pushes but cannot publish or subscribe."""
    from livekit import api
    grants = api.VideoGrants(room_join=True, room=lobby_room_name(meeting), can_publish=False, can_subscribe=False,
                             can_publish_data=False, hidden=True)
    return (api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(guest.identity).with_name(guest.name)
            .with_grants(grants).with_ttl(timedelta(hours=3)).to_jwt())


def push(room, topic, payload, identities=None):
    """Fire-and-forget realtime push through LiveKit (replaces browser polling). Never blocks or raises."""
    if missing_settings():
        return False
    import asyncio
    import threading
    from livekit import api

    async def go():
        lk = api.LiveKitAPI(settings.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://'),
                            settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        try:
            await lk.room.send_data(api.SendDataRequest(
                room=room, data=json.dumps(payload).encode(), kind=api.DataPacket.Kind.RELIABLE,
                topic=topic, destination_identities=list(identities or [])))
        finally:
            await lk.aclose()

    def run():
        try:
            asyncio.run(go())
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()
    return True


def notify_hosts(meeting):
    """Tell everyone in the live room that the lobby changed. No names are sent; hosts refetch the list once."""
    return push(room_name(meeting), 'wdos_lobby', {'changed': True})


def notify_guest(meeting, guest, status):
    """Tell one waiting guest they were admitted or removed."""
    return push(lobby_room_name(meeting), 'wdos_lobby_status', {'status': status}, [guest.identity])
