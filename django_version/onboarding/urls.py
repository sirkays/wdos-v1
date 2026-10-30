from django.urls import path
from . import views, views_hq, views_leader, views_modules

app_name = 'onboarding'

urlpatterns = [
    # 10-Step Leadership Onboarding Wizard
    path('onboarding/', views.start_view, name='start'),
    path('onboarding/doc/<str:code>/', views.doc_view, name='doc'),
    path('onboarding/complete/<str:code>/', views.complete_view, name='complete'),

    # Role-Aware Workspace Home & Meetings Tab
    path('workspace/', views.dashboard_view, name='dashboard'),
    path('workspace/dashboard/', views.dashboard_view, name='legacy_dashboard'),
    path('workspace/meetings/', views.meetings_view, name='meetings'),

    # HQ Command & Executive Dashboards
    path('workspace/switch-hq-fn/', views_hq.switch_hq_fn_view, name='switch_hq_fn'),
    path('workspace/central/', views_hq.central_view, name='central'),
    path('workspace/hofco/', views_hq.hofco_view, name='hofco'),
    path('workspace/role-home/', views_hq.role_home_view, name='role_home'),
    path('workspace/network/<str:net>/', views_hq.network_hq_view, name='network_hq'),
    path('workspace/command/', views_hq.command_view, name='command'),
    path('workspace/ops/', views_hq.ops_view, name='ops'),
    path('workspace/ops/<str:subtab>/', views_hq.ops_view, name='ops_tab'),
    path('workspace/hq-activation/', views_hq.hq_activation_view, name='hq_activation'),
    path('workspace/mailboxes/', views_hq.mailboxes_view, name='mailboxes'),
    path('workspace/accounts/', views_hq.accounts_manage_view, name='accounts_manage'),
    path('workspace/view-as/<uuid:pk>/', views_hq.view_as_view, name='view_as'),
    path('workspace/hq/', views_hq.hq_staff_view, name='hq_staff'),

    # Leader & Volunteer Home + 16 Subtabs
    path('workspace/my/', views_leader.leader_home_view, name='leader_home'),
    path('workspace/my/<str:subtab>/', views_leader.leader_home_view, name='my_tab'),
    path('workspace/reveal-mailbox/', views_leader.reveal_mailbox_view, name='reveal_mailbox'),

    # Organisation Hierarchy, Country HQ, Structure & Leaders Atlas
    path('workspace/organisation/', views_modules.organisation_view, name='organisation'),
    path('workspace/organisation/<uuid:unit_id>/', views_modules.organisation_view, name='organisation_unit'),
    path('workspace/country-hq/', views_modules.country_hq_view, name='country_hq'),
    path('workspace/country-hq/<str:iso>/', views_modules.country_hq_view, name='country_hq'),
    path('workspace/country/', views_modules.country_hq_view, name='country_default'),
    path('workspace/country/<str:iso>/', views_modules.country_hq_view, name='country_iso'),
    path('workspace/structure/', views_modules.structure_view, name='structure'),
    path('workspace/leaders/', views_modules.leaders_atlas_view, name='leaders_atlas'),
    path('workspace/leadership/', views_modules.leaders_atlas_view, name='leadership'),
    path('workspace/leadership-continental/', views_modules.leaders_atlas_view, name='leadership_continental'),

    # Members Directory, 360° Record & Recruitment Pipeline
    path('workspace/members/', views_modules.members_list_view, name='members'),
    path('workspace/members/<uuid:pk>/', views_modules.member_detail_view, name='member_detail'),
    path('workspace/recruitment/', views_modules.recruitment_view, name='recruitment'),
    path('workspace/recruitment/<uuid:pk>/', views_modules.recruitment_view, name='recruitment_detail'),
    path('workspace/reflinks/', views_modules.recruitment_view, name='reflinks'),

    # Tasks, Reporting, Activities & Continental Analytics
    path('workspace/tasks/', views_modules.tasks_module_view, name='tasks'),
    path('workspace/tasks/<uuid:pk>/', views_modules.tasks_module_view, name='task_detail'),
    path('workspace/reporting/', views_modules.reporting_view, name='reporting'),
    path('workspace/reporting/report/<uuid:report_id>/', views_modules.reporting_view, name='report_detail'),
    path('workspace/reporting/<str:subtab>/', views_modules.reporting_view, name='reporting_tab'),
    path('workspace/activities/', views_modules.reporting_view, name='activities'),
    path('workspace/reports/', views_modules.reports_analytics_view, name='reports_analytics'),

    # Programmes, Announcements, Messages, Cases, Helpdesk, Library & Documents
    path('workspace/programmes/', views_modules.programmes_view, name='programmes'),
    path('workspace/announcements/', views_modules.announcements_view, name='announcements'),
    path('workspace/messages/', views_modules.messages_module_view, name='messages'),
    path('workspace/cases/', views_modules.cases_view, name='cases'),
    path('workspace/cases/<uuid:pk>/', views_modules.cases_view, name='case_detail'),
    path('workspace/helpdesk/', views_modules.helpdesk_view, name='helpdesk'),
    path('workspace/helpdesk/<uuid:pk>/', views_modules.helpdesk_view, name='helpdesk_detail'),
    path('workspace/library/', views_modules.library_view, name='library'),
    path('workspace/documents/', views_modules.documents_view, name='documents'),

    # Engagement, Spotlight, Content Studio, Outreach CRM & System Tools
    path('workspace/engagement/', views_modules.engagement_view, name='engagement'),
    path('workspace/spotlight-review/', views_modules.engagement_view, name='spotlight_review'),
    path('workspace/content/', views_modules.engagement_view, name='content_studio'),
    path('workspace/outreach/', views_modules.engagement_view, name='outreach'),
    path('workspace/settings/', views_modules.system_tools_view, {'tool': 'settings'}, name='settings'),
    path('workspace/doctor/', views_modules.system_tools_view, {'tool': 'doctor'}, name='doctor'),
    path('workspace/ask/', views_modules.system_tools_view, {'tool': 'ask'}, name='ask'),
    path('workspace/ask-woddi/', views_modules.system_tools_view, {'tool': 'ask'}, name='ask_woddi'),
    path('workspace/feedback/', views_modules.system_tools_view, {'tool': 'uat'}, name='uat_feedback'),
    path('workspace/planned/<str:tool>/', views_modules.system_tools_view, name='planned'),
]
