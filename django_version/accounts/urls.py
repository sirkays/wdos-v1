from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    # Screen AUTH-01: Welcome / Network Choice
    path('', views.welcome_view, name='welcome'),

    # Screen AUTH-02: Sign In
    path('login/', views.login_view, name='login'),

    # Screen AUTH-03: Register
    path('register/', views.register_view, name='register'),

    # Screen AUTH-04: Verify
    path('verify/', views.verify_view, name='verify'),
    path('resend/', views.resend_view, name='resend'),

    # Screen AUTH-05: Account Status
    path('status/', views.status_view, name='status'),

    # Screen AUTH-06: Recovery
    path('recover/', views.recover_view, name='recover'),

    # Screen AUTH-07: Reset
    path('reset/', views.reset_view, name='reset'),

    # Screen AUTH-08: MFA
    path('mfa/', views.mfa_view, name='mfa'),

    # Session Management
    path('logout/', views.logout_view, name='logout'),
    path('revoke/', views.revoke_view, name='revoke'),

    # Supplemental & Policy
    path('invitation/', views.invitation_view, name='invitation'),
    path('help/', views.help_view, name='help'),
    path('privacy/', views.privacy_view, name='privacy'),
    path('terms/', views.terms_view, name='terms'),
]
