"""python manage.py run_translation_agent   (runs beside the web server; one bot per open WODDI Room)"""
import asyncio
import logging

from asgiref.sync import sync_to_async
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from meetings import livekit
from meetings.translation import azure
from meetings.translation.agent import RoomBot


@sync_to_async
def open_rooms(only=None):
    from django.db import close_old_connections
    from operations.models import Meeting
    # This process never handles web requests, so nothing else recycles its database connection: drop a dead one here,
    # otherwise one dropped Postgres connection would break the room lookup (and so every new meeting) for good.
    close_old_connections()
    now = timezone.now()
    qs = Meeting.objects.filter(platform='woddi', status__in=('scheduled', 'in_progress'),
                                starts_at__lte=now + timezone.timedelta(minutes=15),
                                ends_at__gte=now - timezone.timedelta(minutes=30))
    if only:
        qs = qs.filter(pk=only)
    return {str(m.pk): livekit.room_name(m) for m in qs}


class Command(BaseCommand):
    help = 'Interpreter bot: live captions + spoken translation for WODDI Rooms (LiveKit + Azure).'

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
        for mid, name in rooms.items():
            entry = running.get(mid)
            if entry and entry[0].done():
                # The bot ended on its own (lost its connection, crashed): say why, then replace it.
                err = None if entry[0].cancelled() else entry[0].exception()
                self.stdout.write(f'interpreter for {name} ended ({err or "disconnected"}); restarting')
                entry = None
            if entry is None:
                stop = asyncio.Event()
                running[mid] = (asyncio.create_task(RoomBot(mid, name).run(stop)), stop)
                self.stdout.write(f'interpreter started for {name}')
        for mid in [m for m in running if m not in rooms]:
            running.pop(mid)[1].set()
            self.stdout.write(f'interpreter stopped for meeting {mid}')
