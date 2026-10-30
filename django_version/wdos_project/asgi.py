import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'wdos_project.settings')
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402
import realtime.routing  # noqa: E402


async def http_application(scope, receive, send):
    if scope.get('path') in ('/healthz', '/healthz/'):
        await send(
            {
                'type': 'http.response.start',
                'status': 200,
                'headers': [(b'content-type', b'application/json')],
            }
        )
        await send({'type': 'http.response.body', 'body': b'{"status":"ok"}'})
        return
    await django_asgi_app(scope, receive, send)


_ws_router = URLRouter(realtime.routing.urls)
_allowed_origins = getattr(settings, 'REALTIME_ALLOWED_ORIGINS', None) or ['*']

application = ProtocolTypeRouter(
    {
        'http': http_application,
        'websocket': OriginValidator(_ws_router, _allowed_origins),
    }
)
