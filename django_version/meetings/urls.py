from django.urls import path
from . import guest_views, views

app_name = 'meetings'

urlpatterns = [
    path('workspace/meetings/', views.list_view, name='list'),
    path('workspace/meetings/new/', views.create_view, name='new'),
    path('workspace/meetings/<uuid:pk>/', views.detail_view, name='detail'),
    path('workspace/meetings/<uuid:pk>/join/', views.join_view, name='join'),
    path('workspace/meetings/language/', views.language_view, name='language'),
    path('workspace/meetings/<uuid:pk>/room/', views.room_view, name='room'),
    path('workspace/meetings/<uuid:pk>/token/', views.token_view, name='token'),
    path('workspace/meetings/<uuid:pk>/transcript/', views.transcript_view, name='transcript'),
    path('workspace/meetings/<uuid:pk>/live/', views.live_view, name='live'),
    path('workspace/meetings/<uuid:pk>/attendance/', views.attendance_view, name='attendance'),
    path('workspace/meetings/<uuid:pk>/close/', views.close_view, name='close'),
    path('workspace/meetings/<uuid:pk>/cancel/', views.cancel_view, name='cancel'),
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
    path('join/<str:code>/language/', guest_views.language_view, name='guest_language'),
    # host / moderator tools
    path('workspace/meetings/<uuid:pk>/guests/', guest_views.guests_json_view, name='guests'),
    path('workspace/meetings/<uuid:pk>/guests/<int:gid>/<str:action>/', guest_views.guest_action_view, name='guest_action'),
    path('workspace/meetings/<uuid:pk>/guest-link/', guest_views.guest_link_view, name='guest_link'),
]

