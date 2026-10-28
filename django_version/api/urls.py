from django.urls import path
from . import views

urlpatterns = [
    # Native Django REST API
    path('auth/login/', views.api_login, name='api_login'),
    path('auth/logout/', views.api_logout, name='api_logout'),
    path('auth/session/', views.api_session, name='api_session'),
    path('dashboard/stats/', views.api_dashboard_stats, name='api_dashboard_stats'),
    path('org-units/', views.api_org_units, name='api_org_units'),
    path('members/', views.api_members, name='api_members'),
    path('members/<uuid:member_id>/', views.api_member_detail, name='api_member_detail'),
    path('tasks/', views.api_tasks, name='api_tasks'),
    path('meetings/', views.api_meetings, name='api_meetings'),
    path('announcements/', views.api_announcements, name='api_announcements'),

    # Supabase / PostgREST Compatibility Endpoints
    path('auth/v1/token', views.sb_auth_token, name='sb_auth_token'),
    path('auth/v1/user', views.sb_auth_user, name='sb_auth_user'),
    path('auth/v1/logout', views.sb_auth_logout, name='sb_auth_logout'),
    path('rest/v1/<str:table_name>', views.sb_rest_table, name='sb_rest_table'),
    path('rest/v1/rpc/<str:rpc_name>', views.sb_rest_rpc, name='sb_rest_rpc'),
]
