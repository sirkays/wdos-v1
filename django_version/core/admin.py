from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    OrgUnit, Profile, RoleAssignment, AuditLog,
    OrgSetting, Department, Staff, ModuleAccess
)


@admin.register(OrgUnit)
class OrgUnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'level', 'parent', 'country_iso', 'is_active', 'created_at')
    list_filter = ('level', 'is_active', 'country_iso')
    search_fields = ('name', 'country_iso')
    raw_id_fields = ('parent',)
    ordering = ('name',)


class RoleAssignmentInline(admin.TabularInline):
    model = RoleAssignment
    extra = 0
    fk_name = 'profile'
    fields = ('role', 'org_unit', 'starts_at', 'ends_at')
    raw_id_fields = ('org_unit',)


@admin.register(Profile)
class ProfileAdmin(BaseUserAdmin):
    list_display = (
        'email', 'first_name', 'last_name', 'membership_no',
        'network', 'status', 'org_unit', 'is_leader', 'hq_function', 'is_active'
    )
    list_filter = ('network', 'status', 'is_leader', 'preferred_locale', 'is_staff', 'is_active')
    search_fields = ('email', 'first_name', 'last_name', 'membership_no', 'phone')
    ordering = ('last_name', 'first_name')
    raw_id_fields = ('org_unit',)
    inlines = [RoleAssignmentInline]

    fieldsets = (
        ('Authentication & Identity', {
            'fields': ('email', 'password', 'first_name', 'last_name', 'membership_no', 'phone', 'avatar')
        }),
        ('Organisation & Membership', {
            'fields': ('network', 'status', 'org_unit', 'preferred_locale', 'birth_date')
        }),
        ('Leadership & HQ', {
            'fields': ('is_leader', 'hq_function')
        }),
        ('Permissions & Status', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Timestamps', {
            'fields': ('last_seen_at', 'created_at', 'updated_at')
        }),
    )
    readonly_fields = ('created_at', 'updated_at', 'last_seen_at')


@admin.register(RoleAssignment)
class RoleAssignmentAdmin(admin.ModelAdmin):
    list_display = ('profile', 'role', 'org_unit', 'starts_at', 'ends_at', 'assigned_by')
    list_filter = ('role', 'org_unit__level')
    search_fields = ('profile__email', 'profile__first_name', 'profile__last_name', 'org_unit__name')
    raw_id_fields = ('profile', 'org_unit', 'assigned_by')
    date_hierarchy = 'starts_at'


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('occurred_at', 'actor', 'action', 'table_name', 'record_id', 'reason')
    list_filter = ('action', 'table_name')
    search_fields = ('record_id', 'reason', 'actor__email', 'table_name')
    date_hierarchy = 'occurred_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OrgSetting)
class OrgSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'updated_at')
    search_fields = ('key',)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ('profile', 'department', 'position_title', 'reports_to', 'is_active')
    list_filter = ('department', 'is_active')
    search_fields = ('profile__email', 'profile__first_name', 'profile__last_name', 'position_title')
    raw_id_fields = ('profile', 'reports_to')


@admin.register(ModuleAccess)
class ModuleAccessAdmin(admin.ModelAdmin):
    list_display = ('role', 'module')
    list_filter = ('role',)
    search_fields = ('role', 'module')
