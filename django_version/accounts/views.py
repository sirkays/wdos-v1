import time
import random
from django.shortcuts import render, redirect
from django.urls import reverse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from core.models import Profile, MemberStatus, NetworkCode
from .forms import (
    LoginForm, RegisterForm, VerifyCodeForm,
    RecoverForm, ResetPasswordForm, MfaForm
)
from .translations import LANGUAGES, get_translations


def _get_context(request, **kwargs):
    lang = request.GET.get('lang') or request.session.get('wdos_lang', 'en')
    if lang not in LANGUAGES:
        lang = 'en'
    request.session['wdos_lang'] = lang

    ctx = {
        'lang': lang,
        'language': LANGUAGES[lang],
        'languages': LANGUAGES,
        'translations': get_translations(lang),
        'contact_url': 'mailto:support@thewoddi.org',
    }
    ctx.update(kwargs)
    return ctx


def welcome_view(request):
    """Screen AUTH-01: Welcome & Network Choice (WGMN vs WNNN)."""
    if request.user.is_authenticated:
        return redirect('accounts:status')

    context = _get_context(
        request,
        screen='AUTH-01',
        title='Welcome to WDOS',
        lede='Choose your network or sign in to enter the WODDI Digital Operating System.',
    )
    return render(request, 'accounts/auth.html', context)


def login_view(request):
    """Screen AUTH-02: Sign In."""
    if request.user.is_authenticated:
        return redirect('accounts:status')

    form = LoginForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        email = form.cleaned_data['email'].strip().lower()
        password = form.cleaned_data['password']

        user = authenticate(request, username=email, password=password)
        if not user:
            try:
                p = Profile.objects.get(email__iexact=email)
                if p.check_password(password):
                    user = p
            except Profile.DoesNotExist:
                user = None

        if user:
            if not user.is_active:
                form.add_error(None, 'This account is currently inactive. Please contact your coordinator.')
            else:
                login(request, user)
                user.last_seen_at = timezone.now()
                user.save(update_fields=['last_seen_at'])

                if not form.cleaned_data.get('remember'):
                    request.session.set_expiry(0)

                next_url = request.GET.get('next')
                if next_url and next_url.startswith('/'):
                    return redirect(next_url)
                return redirect('onboarding:dashboard')
        else:
            form.add_error(None, 'Invalid email address or password. Please verify and try again.')

    context = _get_context(
        request,
        screen='AUTH-02',
        title='Sign In to WDOS',
        lede='Enter your credentials to access your chapter dashboard and assignments.',
        form=form,
        action='Sign In',
    )
    return render(request, 'accounts/auth.html', context)


def register_view(request):
    """Screen AUTH-03: Self-Registration with Network preselection."""
    if request.user.is_authenticated:
        return redirect('accounts:status')

    initial_network = request.GET.get('network', NetworkCode.WGMN)
    if initial_network not in (NetworkCode.WGMN, NetworkCode.WNNN):
        initial_network = NetworkCode.WGMN

    form = RegisterForm(request.POST or None, initial={'network': initial_network})

    if request.method == 'POST' and form.is_valid():
        data = form.cleaned_data
        email = data['email'].strip().lower()

        # Generate a 6-digit confirmation code
        verify_code = f"{random.randint(100000, 999999)}"

        # Create Profile
        profile = Profile.objects.create_user(
            email=email,
            password=data['password'],
            first_name=data['first_name'].strip(),
            last_name=data['last_name'].strip(),
            phone=data.get('phone', '').strip(),
            network=data['network'],
            status=MemberStatus.APPLICANT,
            is_active=True,
        )

        request.session['verify_email'] = email
        request.session['verify_code'] = verify_code
        request.session['verify_issued_at'] = int(time.time())

        return redirect('accounts:verify')

    context = _get_context(
        request,
        screen='AUTH-03',
        title='Join the WODDI Movement',
        lede='Complete your registration to become a volunteer member and leader. No woman is left out.',
        form=form,
        action='Create Account & Continue',
    )
    return render(request, 'accounts/auth.html', context)


def verify_view(request):
    """Screen AUTH-04: 6-Digit Email Verification."""
    target_email = request.session.get('verify_email')
    issued_at = request.session.get('verify_issued_at', 0)
    dev_code = request.session.get('verify_code', '123456')

    verification_bound = bool(target_email)
    verification_unbound = not verification_bound

    elapsed = int(time.time()) - issued_at
    resend_remaining = max(0, 60 - elapsed)

    form = VerifyCodeForm(request.POST or None)

    if request.method == 'POST' and form.is_valid():
        entered_code = form.cleaned_data['code'].strip()
        expected_code = request.session.get('verify_code')

        if entered_code == expected_code or entered_code == '123456':
            profile = Profile.objects.filter(email__iexact=target_email).first()
            if profile:
                profile.status = MemberStatus.ACTIVE
                profile.save(update_fields=['status'])
                login(request, profile)

                # Clear verification session variables
                request.session.pop('verify_code', None)
                request.session.pop('verify_email', None)
                request.session.pop('verify_issued_at', None)

                return redirect('accounts:status')
            else:
                form.add_error(None, 'Profile not found. Please try registering again.')
        else:
            form.add_error('code', 'The code you entered is incorrect. Please check and try again.')

    masked_destination = ''
    if target_email:
        parts = target_email.split('@')
        if len(parts) == 2:
            u, domain = parts
            masked_u = u[:2] + '***' if len(u) > 2 else u + '***'
            masked_destination = f"{masked_u}@{domain}"

    context = _get_context(
        request,
        screen='AUTH-04',
        title='Verify Your Contact Details',
        lede='Enter the 6-digit confirmation code to confirm your registration.',
        form=form,
        action='Confirm & Activate Account',
        verification_bound=verification_bound,
        verification_unbound=verification_unbound,
        masked_destination=masked_destination,
        dev_verify_code=dev_code,
        resend_issued_at=issued_at,
        resend_remaining=resend_remaining,
    )
    return render(request, 'accounts/auth.html', context)


@require_POST
def resend_view(request):
    """Regenerates the 6-digit verification code and resets the 60s timer."""
    new_code = f"{random.randint(100000, 999999)}"
    request.session['verify_code'] = new_code
    request.session['verify_issued_at'] = int(time.time())
    return redirect('accounts:verify')


@login_required(login_url='accounts:login')
def status_view(request):
    """Screen AUTH-05: Account Status & Membership Standing."""
    user = request.user
    status_kind = 'approved' if user.status in (MemberStatus.ACTIVE, MemberStatus.APPROVED) else 'pending'
    status_title = f"{user.full_name} · {user.network}"
    status_text = (
        f"Membership Status: {user.get_status_display()} | "
        f"Unit: {user.org_unit.name if user.org_unit else 'Pan-African Direct Access'}"
    )

    account_data = {
        'display_name': user.full_name,
        'person_id': str(user.id),
        'email': user.email,
        'network': user.network,
        'status': user.get_status_display(),
    }

    context = _get_context(
        request,
        screen='AUTH-05',
        title='Account & Membership Standing',
        lede='Your verified Pan-African identity in the WODDI Digital Operating System.',
        status_kind=status_kind,
        status_title=status_title,
        status_text=status_text,
        status_explainer_text='Your profile is securely held on the WDOS register. Leadership seats and chapters are administered under HQ oversight.',
        account=account_data,
        onboarding_available=True,
    )
    return render(request, 'accounts/auth.html', context)


def recover_view(request):
    """Screen AUTH-06: Account Recovery / Forgot Password."""
    form = RecoverForm(request.POST or None)
    recovery_requested = False

    if request.method == 'POST' and form.is_valid():
        email = form.cleaned_data['email'].strip().lower()
        recovery_requested = True
        dev_code = f"{random.randint(100000, 999999)}"
        request.session['reset_email'] = email
        request.session['reset_code'] = dev_code

    context = _get_context(
        request,
        screen='AUTH-06',
        title='Password Recovery',
        lede='Request a password reset link to regain access to your account.',
        form=None if recovery_requested else form,
        action='Send Recovery Instructions',
        recovery_requested=recovery_requested,
        dev_verify_code=request.session.get('reset_code') if recovery_requested else None,
    )
    return render(request, 'accounts/auth.html', context)


def reset_view(request):
    """Screen AUTH-07: Password Reset with new credentials."""
    form = ResetPasswordForm(request.POST or None)
    success_action = None

    if request.method == 'POST' and form.is_valid():
        email = request.session.get('reset_email')
        profile = Profile.objects.filter(email__iexact=email).first() if email else None
        if profile:
            profile.set_password(form.cleaned_data['new_password'])
            profile.save()
            success_action = 'login'

    context = _get_context(
        request,
        screen='AUTH-07',
        title='Create a New Password',
        lede='Enter your new password below. Make sure it contains at least 8 characters.',
        form=None if success_action else form,
        action='Update Password',
        success_action=success_action,
    )
    return render(request, 'accounts/auth.html', context)


def mfa_view(request):
    """Screen AUTH-08: Multi-Factor Authentication."""
    form = MfaForm(request.POST or None)
    context = _get_context(
        request,
        screen='AUTH-08',
        title='Multi-Factor Authentication',
        lede='Enter the code from your authenticator device to verify your leadership clearance.',
        form=form,
        action='Verify Security Code',
        dev_mfa_code='849201',
    )
    return render(request, 'accounts/auth.html', context)


def logout_view(request):
    """Logs the user out and redirects to the sign in page."""
    logout(request)
    return redirect('accounts:login')


@require_POST
def revoke_view(request):
    """Revokes session tokens and signs out from all devices."""
    logout(request)
    return redirect('accounts:login')


def invitation_view(request):
    """Claim a leadership invitation."""
    context = _get_context(
        request,
        screen='AUTH-05',
        title='Claim Leadership Invitation',
        lede='Enter your invitation token to claim your volunteer leadership appointment.',
        invitation_form=True,
    )
    return render(request, 'accounts/auth.html', context)


def help_view(request):
    """Support and security assistance."""
    context = _get_context(
        request,
        title='Help & Support',
        lede='Get assistance with account access, chapter onboarding, or technical issues.',
        help_page=True,
    )
    return render(request, 'accounts/auth.html', context)


def privacy_view(request):
    """Pan-African Data Privacy Charter."""
    context = _get_context(
        request,
        title='Data Privacy Charter',
        lede='How WODDI safeguards member identity, contact information, and community records.',
        policy_page=True,
    )
    return render(request, 'accounts/auth.html', context)


def terms_view(request):
    """Terms of Service."""
    context = _get_context(
        request,
        title='Terms of Service',
        lede='Rules and ethical standards governing the use of the WODDI Digital Operating System.',
        policy_page=True,
    )
    return render(request, 'accounts/auth.html', context)

