from django.urls import path
from . import guest_views, views, zoom_views
from .zoom.webhooks import zoom_webhook_view

app_name = 'meetings'

urlpatterns = [
    path('workspace/meetings/', views.list_view, name='list'),
    path('workspace/meetings/new/', views.create_view, name='new'),
    path('workspace/meetings/<uuid:pk>/', views.detail_view, name='detail'),
    path('workspace/meetings/<uuid:pk>/join/', views.join_view, name='join'),
    path('workspace/meetings/<uuid:pk>/room/', views.room_view, name='room'),
    path('workspace/meetings/<uuid:pk>/token/', views.token_view, name='token'),
    path('workspace/meetings/<uuid:pk>/transcript/', views.transcript_view, name='transcript'),
    path('workspace/meetings/<uuid:pk>/live/', views.live_view, name='live'),
    path('workspace/meetings/<uuid:pk>/attendance/', views.attendance_view, name='attendance'),
    path('workspace/meetings/<uuid:pk>/close/', views.close_view, name='close'),
    path('workspace/meetings/<uuid:pk>/end/', views.end_view, name='end'),
    path('workspace/meetings/<uuid:pk>/control/', views.control_view, name='control'),
    path('workspace/meetings/<uuid:pk>/cancel/', views.cancel_view, name='cancel'),
    path('workspace/meetings/<uuid:pk>/delete/', views.delete_view, name='delete'),
    path('workspace/meetings/<uuid:pk>/upload/', views.upload_view, name='upload'),
    path('workspace/meetings/<uuid:pk>/files/<int:file_id>/', views.download_view, name='download'),
    # guest access (no login)
    path('join/<str:code>/', guest_views.join_view, name='guest_join'),
    path('join/<str:code>/wait/', guest_views.wait_view, name='guest_wait'),
    path('join/<str:code>/status/', guest_views.status_view, name='guest_status'),
    path('join/<str:code>/lobby-token/', guest_views.lobby_token_view, name='guest_lobby_token'),
    path('join/<str:code>/leave/', guest_views.leave_view, name='guest_leave'),
    path('join/<str:code>/room/', guest_views.room_view, name='guest_room'),
    path('join/<str:code>/token/', guest_views.token_view, name='guest_token'),
    # host / moderator tools
    path('workspace/meetings/<uuid:pk>/guests/', guest_views.guests_json_view, name='guests'),
    path('workspace/meetings/<uuid:pk>/guests/<int:gid>/<str:action>/', guest_views.guest_action_view, name='guest_action'),
    path('workspace/meetings/<uuid:pk>/guest-link/', guest_views.guest_link_view, name='guest_link'),
    # Zoom Meeting SDK & Realtime WebSocket tickets + webhooks
    path('workspace/meetings/<uuid:pk>/zoom/', zoom_views.zoom_room_view, name='zoom_room'),
    path('workspace/meetings/<uuid:pk>/zoom/signature/', zoom_views.zoom_signature_view, name='zoom_signature'),
    path('workspace/meetings/<uuid:pk>/ws-ticket/', zoom_views.ws_ticket_view, name='ws_ticket'),
    path('join/<str:code>/zoom/', zoom_views.guest_zoom_room_view, name='guest_zoom_room'),
    path('join/<str:code>/zoom/signature/', zoom_views.guest_zoom_signature_view, name='guest_zoom_signature'),
    path('join/<str:code>/ws-ticket/', zoom_views.guest_ws_ticket_view, name='guest_ws_ticket'),
    path('integrations/zoom/webhook/', zoom_webhook_view, name='zoom_webhook'),
]

