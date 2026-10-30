from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from accounts import views as account_views
from accounts import views_doors


def healthz_view(request):
    return JsonResponse({'status': 'ok'})

admin.site.site_header = "WDOS Administration"
admin.site.site_title = "WDOS Portal"
admin.site.index_title = "WODDI Digital Operating System — Management"

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),
    path('healthz', healthz_view, name='healthz'),
    path('healthz/', healthz_view, name='healthz_slash'),

    # Native Django REST APIs
    path('api/', include('api.urls')),

    # Root landing maps to Welcome view
    path('', account_views.welcome_view, name='root_welcome'),

    # Public Entry Doors (top-level convenience paths matching old SPA routes)
    path('apply/', views_doors.apply_view, name='top_apply'),
    path('join/WGMN/', views_doors.referral_join_view, {'code': 'WGMN'}, name='top_join_wgmn'),
    path('join/WNNN/', views_doors.referral_join_view, {'code': 'WNNN'}, name='top_join_wnnn'),
    path('join/wgmn/', views_doors.referral_join_view, {'code': 'WGMN'}, name='top_join_wgmn_lower'),
    path('join/wnnn/', views_doors.referral_join_view, {'code': 'WNNN'}, name='top_join_wnnn_lower'),
    path('join/WODDI/', views_doors.referral_join_view, {'code': 'WODDI'}, name='top_join_woddi'),
    path('referral-join/<str:code>/', views_doors.referral_join_view, name='top_referral_join'),
    path('candidate/', views_doors.candidate_door_view, name='top_candidate_door'),
    path('r/<str:code>/', views_doors.referral_landing_view, name='top_referral_landing'),
    path('volunteer/', views_doors.volunteer_register_view, name='top_volunteer'),
    path('wgmn/', views_doors.volunteer_register_view, {'preset_network': 'WGMN'}, name='top_wgmn'),
    path('wnnn/', views_doors.volunteer_register_view, {'preset_network': 'WNNN'}, name='top_wnnn'),
    path('claim/', views_doors.claim_view, name='top_claim'),
    path('id/', views_doors.id_start_view, name='top_id_start'),

    # WDOS Accounts & Authentication
    path('accounts/', include('accounts.urls')),

    path('activation/', include('activation.urls', namespace='activation')),

    path('', include('meetings.urls', namespace='meetings')),

    # WDOS Onboarding (/onboarding/...) and the member workspace (/workspace/...)
    path('', include('onboarding.urls', namespace='onboarding')),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
