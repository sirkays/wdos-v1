from django.urls import path
from . import views

app_name = 'onboarding'

urlpatterns = [
    path('onboarding/', views.start_view, name='start'),
    path('onboarding/doc/<str:code>/', views.doc_view, name='doc'),
    path('onboarding/complete/<str:code>/', views.complete_view, name='complete'),
    path('workspace/', views.dashboard_view, name='dashboard'),
    path('workspace/activities/', views.activities_view, name='activities'),
    path('workspace/meetings/', views.meetings_view, name='meetings'),
    path('workspace/tasks/', views.tasks_view, name='tasks'),
    path('workspace/structure/', views.structure_view, name='structure'),
    path('workspace/members/', views.members_view, name='members'),
]

