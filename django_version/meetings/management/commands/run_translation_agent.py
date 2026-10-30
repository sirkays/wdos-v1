"""python manage.py run_translation_agent   (runs beside the web server; one bot per open WODDI Room)"""
import asyncio
import logging
import time

from asgiref.sync import sync_to_async
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from meetings import livekit
from meetings.translation import azure
from meetings.translation.agent import RoomBot, Superseded

SUPERSEDED_COOLDOWN = 60    # seconds to stay out of a room another interpreter instance has taken over
EMPTY_GRACE = 60            # seconds a bot stays in a room after the last person left (covers page reloads / reconnects)
QUOTA_COOLDOWN = 300        # seconds to wait after LiveKit refuses a connection because the project quota is used up


async def occupied_rooms(names):
    """Names of the given LiveKit rooms that have at least one real person in them (the interpreter itself does not count).
    The bot is billed for every minute it is connected, so it must never sit in a room nobody is in: a meeting with no set
    time counts as open forever. Returns None if LiveKit could not be asked (the caller then starts nothing new).
    These are server API calls, which do not use connection minutes."""
    from django.conf import settings
    from livekit import api

    from meetings.translation.languages import BOT_IDENTITY
    names = list(names)
    if not names:
        return set()
    lk = api.LiveKitAPI(settings.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://'),
                        settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    try:
        live = await lk.room.list_rooms(api.ListRoomsRequest(names=names))
        out = set()
        for r in live.rooms:
            if r.num_participants <= 0:
                continue
            ps = await lk.room.list_participants(api.ListParticipantsRequest(room=r.name))
            if any(not p.identity.startswith(BOT_IDENTITY) for p in ps.participants):
                out.add(r.name)
        return out
    except Exception as exc:
        logging.getLogger(__name__).warning('could not check who is in the rooms: %s', exc)
        return None
    finally:
        await lk.aclose()


@sync_to_async
def open_rooms(only=None):
    from django.db import close_old_connections
    from operations.models import Meeting
    # This process never handles web requests, so nothing else recycles its database connection: drop a dead one here,
    # otherwise one dropped Postgres connection would break the room lookup (and so every new meeting) for good.
    close_old_connections()
    now = timezone.now()
    from django.db.models import Q
    # Meetings with no set time (null start/end) count as always open.
    qs = Meeting.objects.filter(platform='woddi', status__in=('scheduled', 'in_progress')).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=now + timezone.timedelta(minutes=15))).filter(
        Q(ends_at__isnull=True) | Q(ends_at__gte=now - timezone.timedelta(minutes=30)))
    if only:
        qs = qs.filter(pk=only)
    return {str(m.pk): livekit.room_name(m) for m in qs}


class Command(BaseCommand):
    help = 'Interpreter bot: live captions + spoken translation for WODDI Rooms (LiveKit + Azure).'

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.cool = {}      # meeting id -> time.monotonic() before which we must not rejoin (another instance owns the room)
        self.empty_since = {}   # meeting id -> time.monotonic() when its room was first seen with no person in it

    def add_arguments(self, parser):
        parser.add_argument('--meeting', help='Only this meeting id')
        parser.add_argument('--poll', type=int, default=10, help='Seconds between checks for open rooms')

    def handle(self, *a, **o):
        gaps = livekit.missing_settings() + azure.missing()
        if gaps:
            raise CommandError('Missing settings: ' + ', '.join(gaps))
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(message)s')
        try:
            asyncio.run(self.supervise(o.get('meeting'), o['poll']))
        except KeyboardInterrupt:
            pass

    async def supervise(self, only, poll):
        running = {}    # meeting id -> (task, stop event)
        while True:
            try:
                await self.tick(running, only)
            except Exception as exc:    # a lookup hiccup must not take down every room's interpreter
                logging.getLogger(__name__).exception('interpreter supervisor: %s', exc)
            await asyncio.sleep(poll)

    async def tick(self, running, only):
        rooms = await open_rooms(only)
        now = time.monotonic()
        # Only interpret rooms people are actually in. A bot already running keeps its room for EMPTY_GRACE seconds after
        # the last person leaves; if LiveKit cannot be asked, running bots stay and no new ones start.
        occupied = await occupied_rooms(rooms.values())
        wanted = {}
        for mid, name in rooms.items():
            if occupied is None:
                if mid in running:
                    wanted[mid] = name
            elif name in occupied:
                self.empty_since.pop(mid, None)
                wanted[mid] = name
            elif mid in running and now - self.empty_since.setdefault(mid, now) < EMPTY_GRACE:
                wanted[mid] = name
        for mid in [m for m in self.empty_since if m not in wanted]:
            self.empty_since.pop(mid, None)
        rooms = wanted
        for mid, name in rooms.items():
            entry = running.get(mid)
            if entry and entry[0].done():
                # The bot ended on its own (lost its connection, crashed, was replaced): say why, then replace it.
                err = None if entry[0].cancelled() else entry[0].exception()
                running.pop(mid)
                entry = None
                if isinstance(err, Superseded):
                    # Another instance (a deploy overlapping this one, or a second worker) now owns the room. Leave it alone for
                    # a while instead of rejoining at once, or the two instances would keep kicking each other out.
                    self.cool[mid] = now + SUPERSEDED_COOLDOWN
                    self.stdout.write(f'interpreter for {name} was replaced by another instance; waiting {SUPERSEDED_COOLDOWN}s')
                elif err and ('429' in str(err) or 'limit exceeded' in str(err).lower()):
                    # LiveKit refuses every connection while the project's connection-minutes quota is used up.
                    # Retrying every poll only floods the logs; wait, and say clearly what is wrong.
                    self.cool[mid] = now + QUOTA_COOLDOWN
                    self.stdout.write(f'interpreter for {name}: LiveKit connection-minutes limit exceeded; '
                                      f'retrying in {QUOTA_COOLDOWN}s (upgrade the LiveKit plan or wait for the quota reset)')
                else:
                    self.stdout.write(f'interpreter for {name} ended ({err or "disconnected"}); restarting')
            if entry is None:
                if self.cool.get(mid, 0) > now:
                    continue
                stop = asyncio.Event()
                running[mid] = (asyncio.create_task(RoomBot(mid, name).run(stop)), stop)
                self.stdout.write(f'interpreter started for {name}')
        for mid in [m for m in running if m not in rooms]:
            task, stop = running.pop(mid)
            stop.set()
            if task.done() and not task.cancelled():
                task.exception()    # mark it as seen: a room closing disconnects its bot, which is expected
            self.stdout.write(f'interpreter stopped for meeting {mid}')
        for mid in [m for m in self.cool if m not in rooms]:
            self.cool.pop(mid, None)
