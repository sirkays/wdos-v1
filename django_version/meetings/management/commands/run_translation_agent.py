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
    from operations.models import Meeting
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
            rooms = await open_rooms(only)
            for mid, name in rooms.items():
                if mid not in running or running[mid][0].done():
                    stop = asyncio.Event()
                    running[mid] = (asyncio.create_task(RoomBot(mid, name).run(stop)), stop)
                    self.stdout.write(f'interpreter started for {name}')
            for mid in [m for m in running if m not in rooms]:
                running.pop(mid)[1].set()
                self.stdout.write(f'interpreter stopped for meeting {mid}')
            await asyncio.sleep(poll)
