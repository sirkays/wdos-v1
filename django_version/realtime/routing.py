from django.urls import re_path
from .consumers import GuestLobbyConsumer, MeetingConsumer

urls = [
    re_path(r'^ws/meetings/(?P<pk>[0-9a-fA-F-]+)/$', MeetingConsumer.as_asgi()),
    re_path(r'^ws/guest/(?P<code>[^/]+)/$', GuestLobbyConsumer.as_asgi()),
]

websocket_urlpatterns = urls
