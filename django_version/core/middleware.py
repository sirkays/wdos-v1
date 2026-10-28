from urllib.parse import unquote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone


class BrowserTimezoneMiddleware:
    """Use the browser's time zone (cookie `wdos_tz`, set by templates/_tz.html) for parsing and showing times."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        name = unquote(request.COOKIES.get('wdos_tz', ''))[:64]
        try:
            timezone.activate(ZoneInfo(name)) if name else timezone.deactivate()
        except (ZoneInfoNotFoundError, ValueError):
            timezone.deactivate()
        return self.get_response(request)
