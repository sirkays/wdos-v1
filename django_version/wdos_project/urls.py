from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static
from accounts import views as account_views

admin.site.site_header = "WDOS Administration"
admin.site.site_title = "WDOS Portal"
admin.site.index_title = "WODDI Digital Operating System â€” Management"

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),

    # Native Django REST APIs
    path('api/', include('api.urls')),

    # Root landing maps to Welcome view
    path('', account_views.welcome_view, name='root_welcome'),

    # WDOS Accounts & Authentication (UI Guide)
    path('accounts/', include('accounts.urls')),

    path('activation/', include('activation.urls', namespace='activation')),

    path('', include('meetings.urls', namespace='meetings')),

    # WDOS Onboarding (/onboarding/...) and the member workspace (/workspace/...)
    path('', include('onboarding.urls', namespace='onboarding')),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


