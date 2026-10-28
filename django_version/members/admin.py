from django.contrib import admin
from .models import Application, Referral, PositionMailbox


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = (
        'first_name', 'last_name', 'email', 'network',
        'org_unit', 'status', 'reviewer', 'created_at'
    )
    list_filter = ('network', 'status', 'org_unit__level')
    search_fields = ('first_name', 'last_name', 'email', 'phone')
    raw_id_fields = ('org_unit', 'reviewer', 'decided_by', 'profile')
    date_hierarchy = 'created_at'


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ('referral_code', 'referrer', 'network', 'views_count', 'signups_count', 'created_at')
    list_filter = ('network',)
    search_fields = ('referral_code', 'referrer__email', 'candidate_email')
    raw_id_fields = ('referrer',)


@admin.register(PositionMailbox)
class PositionMailboxAdmin(admin.ModelAdmin):
    list_display = ('position_code', 'display_name', 'email_address', 'org_unit', 'is_active')
    list_filter = ('is_active', 'org_unit__level')
    search_fields = ('position_code', 'display_name', 'email_address')
    raw_id_fields = ('org_unit',)
