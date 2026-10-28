from django.urls import path
from . import views

app_name = 'activation'

urlpatterns = [
    path('', views.home_view, name='home'),
    path('doc/<str:name>/', views.doc_view, name='doc'),
    path('save/<int:day>/', views.save_view, name='save'),
    path('complete/<int:day>/', views.complete_view, name='complete'),
    path('assessment/', views.assessment_view, name='assessment'),
    path('extension/', views.extension_view, name='extension'),
]
