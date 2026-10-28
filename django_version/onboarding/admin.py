from django.contrib import admin
from .models import OnboardingProgress


@admin.register(OnboardingProgress)
class OnboardingProgressAdmin(admin.ModelAdmin):
    list_display = ('profile', 'step_code', 'mode', 'reached_end', 'seconds_spent', 'done_at')
    list_filter = ('step_code', 'mode', 'reached_end')
    search_fields = ('profile__email', 'profile__first_name', 'profile__last_name', 'step_code')
    raw_id_fields = ('profile',)
    date_hierarchy = 'done_at'
