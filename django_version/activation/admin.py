from django.contrib import admin
from .models import CandidateActivation, ActivationStep, ReadinessAssessment


class ActivationStepInline(admin.TabularInline):
    model = ActivationStep
    extra = 0
    readonly_fields = ('day', 'status', 'seconds_spent', 'reached_end', 'completed_at')


class ReadinessAssessmentInline(admin.StackedInline):
    model = ReadinessAssessment
    extra = 0
    readonly_fields = ('submitted_at',)


@admin.register(CandidateActivation)
class CandidateActivationAdmin(admin.ModelAdmin):
    list_display = ('profile', 'route', 'network', 'role', 'status', 'started_at', 'deadline', 'completed_at')
    list_filter = ('route', 'status', 'network')
    search_fields = ('profile__email', 'profile__first_name', 'profile__last_name', 'referral_code', 'role')
    raw_id_fields = ('profile',)
    inlines = [ActivationStepInline, ReadinessAssessmentInline]


@admin.register(ActivationStep)
class ActivationStepAdmin(admin.ModelAdmin):
    list_display = ('activation', 'day', 'status', 'reached_end', 'seconds_spent', 'completed_at')
    list_filter = ('day', 'status', 'reached_end')
    search_fields = ('activation__profile__email', 'activation__profile__first_name')
    raw_id_fields = ('activation',)


@admin.register(ReadinessAssessment)
class ReadinessAssessmentAdmin(admin.ModelAdmin):
    list_display = ('activation', 'status', 'version', 'submitted_at')
    list_filter = ('status', 'version')
    search_fields = ('activation__profile__email', 'return_note')
    raw_id_fields = ('activation',)
