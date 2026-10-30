import re
from datetime import timedelta
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.shortcuts import render, redirect
from django.utils import timezone
from core.models import OrgUnit, Profile, OrgLevel, RoleCode, NetworkCode, MemberStatus, get_role_title
from members.models import Application, ApplicationStatus, Referral
from activation.models import CandidateActivation


EMAIL_TYPO_MAP = {
    'gmial.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.cmo': 'gmail.com',
    'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'outlok.com': 'outlook.com',
}

LEADERSHIP_POSITIONS = [
    ('country_rep', 'Country Representative / Lead'),
    ('deputy_country_rep', 'Deputy Country Representative / Lead'),
    ('state_coordinator', 'State / Regional Coordinator / Lead'),
    ('assistant_state_coordinator', 'Assistant State / Regional Coordinator / Lead'),
    ('state_secretary', 'State / Regional Secretary'),
    ('lga_coordinator', 'LGA / District Coordinator / Lead'),
    ('assistant_lga_coordinator', 'Assistant LGA / District Coordinator / Lead'),
    ('lga_secretary', 'LGA / District Secretary'),
    ('ward_coordinator', 'Community Cluster / Ward Coordinator / Lead'),
    ('chapter_coordinator', 'Chapter Coordinator / Lead'),
    ('other_unsure', 'Other / Not Sure Yet'),
]


def check_email_typo(email):
    email = (email or '').strip().lower()
    if '@' not in email:
        return 'Please enter a valid email address.'
    local, domain = email.rsplit('@', 1)
    if domain in EMAIL_TYPO_MAP:
        suggestion = f"{local}@{EMAIL_TYPO_MAP[domain]}"
        return f"Did you mean {suggestion}? Please check your email domain."
    if domain.endswith('.con') or domain.endswith('.cmo'):
        fixed = domain[:-4] + '.com'
        return f"Did you mean {local}@{fixed}? Please check the '.com' ending."
    return None


def _mask_email(email):
    if not email or '@' not in email:
        return ''
    local, dom = email.split('@', 1)
    if len(local) <= 2:
        masked = local[0] + '*'
    else:
        masked = local[:2] + ('*' * (len(local) - 2))
    return f"{masked}@{dom}"


def apply_view(request):
    """Public Online Application Form (apply.js — 7-Day Open Call route, Founder's age-band rule)."""
    countries = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True).order_by('name')
    states = OrgUnit.objects.filter(level=OrgLevel.STATE_REGION, is_active=True).order_by('name')
    chapters = OrgUnit.objects.filter(level=OrgLevel.CHAPTER, is_active=True).order_by('name')
    stored_ref = request.session.get('wdos_ref_code', '')

    error = None
    success = False
    submitted_app = None

    if request.method == 'POST':
        first_name = (request.POST.get('first_name') or '').strip()
        last_name = (request.POST.get('last_name') or '').strip()
        email = (request.POST.get('email') or '').strip().lower()
        phone = (request.POST.get('phone') or '').strip()
        age_band = (request.POST.get('age_band') or '30+').strip()
        motivation = (request.POST.get('motivation') or '').strip()
        role_applied = (request.POST.get('role_applied') or '').strip()
        org_unit_id = (request.POST.get('org_unit_id') or '').strip()
        country_name = (request.POST.get('country') or '').strip()
        state_name = (request.POST.get('state') or '').strip()
        lga_name = (request.POST.get('lga') or '').strip()
        ref_code = (request.POST.get('referral_code') or stored_ref or '').strip()
        start_open7 = request.POST.get('start_open7') == '1'
        password = request.POST.get('password') or ''

        # Founder's Rule: Age decides the network
        network = NetworkCode.WNNN if age_band == '18-29' else NetworkCode.WGMN

        typo_err = check_email_typo(email)
        if not first_name or not last_name:
            error = 'First name and last name are required.'
        elif typo_err:
            error = typo_err
        elif len(motivation) < 20:
            error = 'Please share your motivation in at least 20 characters.'
        else:
            unit = None
            if org_unit_id:
                unit = OrgUnit.objects.filter(pk=org_unit_id).first()
            if not unit and country_name:
                unit = OrgUnit.objects.filter(name__iexact=country_name, level=OrgLevel.COUNTRY).first()
            if not unit:
                unit = OrgUnit.objects.filter(level=OrgLevel.COUNTRY).first() or OrgUnit.objects.first()

            existing = Application.objects.filter(email__iexact=email, status__in=['submitted', 'under_review']).first()
            if existing:
                error = 'An active application with this email address has already been submitted.'
            else:
                profile = Profile.objects.filter(email__iexact=email).first()
                if not profile and password and len(password) >= 8:
                    profile = Profile.objects.create_user(
                        email=email,
                        password=password,
                        first_name=first_name,
                        last_name=last_name,
                        phone=phone,
                        network=network,
                        org_unit=unit,
                        country=country_name or (unit.name if unit else ''),
                        state_region=state_name,
                        lga=lga_name,
                        role_applied=role_applied,
                        referral_code=ref_code,
                        status=MemberStatus.APPLICANT,
                    )

                submitted_app = Application.objects.create(
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    phone=phone,
                    age_band=age_band,
                    network=network,
                    org_unit=unit,
                    role_applied=role_applied,
                    referral_code=ref_code,
                    source_category='online',
                    country=country_name or (unit.name if unit else ''),
                    state=state_name,
                    lga=lga_name,
                    motivation=motivation,
                    profile=profile,
                    status=ApplicationStatus.SUBMITTED,
                )
                if ref_code:
                    ref_obj = Referral.objects.filter(referral_code__iexact=ref_code).first()
                    if ref_obj:
                        ref_obj.signups_count += 1
                        ref_obj.save(update_fields=['signups_count'])

                if profile and start_open7:
                    CandidateActivation.objects.get_or_create(
                        profile=profile,
                        route='open7',
                        defaults={
                            'network': network,
                            'role': role_applied or 'chapter_coordinator',
                            'referral_code': ref_code or '',
                            'status': 'in_progress',
                            'started_at': timezone.now(),
                            'deadline': timezone.now() + timedelta(days=7),
                        }
                    )
                    login(request, profile, backend='django.contrib.auth.backends.ModelBackend')
                    return redirect('activation:home')

                success = True

    return render(request, 'accounts/doors.html', {
        'door_mode': 'apply',
        'page_title': 'Volunteer & Leadership Application',
        'countries': countries,
        'states': states,
        'chapters': chapters,
        'positions': LEADERSHIP_POSITIONS,
        'stored_ref': stored_ref,
        'error': error,
        'success': success,
        'submitted_app': submitted_app,
    })


def referral_join_view(request, code='WGMN'):
    """3-Day Referral Activation Registration Form (join.js — #/join/WGMN and #/join/WNNN)."""
    norm_code = (code or '').strip().upper()
    if norm_code in ('', 'WODDI'):
        return candidate_door_view(request)

    network = NetworkCode.WNNN if norm_code == 'WNNN' else NetworkCode.WGMN
    ref_obj = Referral.objects.filter(referral_code__iexact=norm_code).first()
    if ref_obj and not ref_obj.is_active:
        return render(request, 'accounts/doors.html', {
            'door_mode': 'referral_paused',
            'page_title': f'{network} Referral Activation Paused',
            'network': network,
        })

    if request.method == 'GET':
        if request.user.is_authenticated:
            logout(request)
        if ref_obj:
            ref_obj.views_count += 1
            ref_obj.save(update_fields=['views_count'])

    countries = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True).order_by('name')
    states = OrgUnit.objects.filter(level=OrgLevel.STATE_REGION, is_active=True).order_by('name')
    positions = [(k, get_role_title(k, network) if k != 'other_unsure' else lbl) for k, lbl in LEADERSHIP_POSITIONS]

    error = None
    if request.method == 'POST':
        first_name = (request.POST.get('first_name') or '').strip()
        last_name = (request.POST.get('last_name') or '').strip()
        email = (request.POST.get('email') or '').strip().lower()
        phone = (request.POST.get('phone') or '').strip()
        birth_date = (request.POST.get('birth_date') or '').strip() or None
        preferred_locale = (request.POST.get('preferred_locale') or 'en').strip()
        source_cat = (request.POST.get('source_cat') or 'volunteer_leader').strip()
        referrer_name = (request.POST.get('referrer_name') or '').strip()
        role_considered = (request.POST.get('role_considered') or 'state_coordinator').strip()
        country_id = (request.POST.get('country_unit') or '').strip()
        state_text = (request.POST.get('state_text') or '').strip()
        lga_text = (request.POST.get('lga_text') or '').strip()
        password = request.POST.get('password') or ''
        confirm_password = request.POST.get('confirm_password', password)
        consent = request.POST.get('consent', '1') != '0'

        typo_err = check_email_typo(email)
        if not first_name or not last_name:
            error = 'First name and last name are required.'
        elif typo_err:
            error = typo_err
        elif not phone:
            error = 'Phone / WhatsApp number is required.'
        elif not referrer_name:
            error = 'Please enter the name of the person who referred you.'
        elif len(password) < 8:
            error = 'Password must be at least 8 characters.'
        elif password != confirm_password:
            error = 'Passwords do not match.'
        elif not consent:
            error = 'Please confirm your consent to begin the 3-Day Referral Activation.'
        else:
            unit = OrgUnit.objects.filter(pk=country_id).first() if country_id else None
            if not unit:
                unit = OrgUnit.objects.filter(level=OrgLevel.COUNTRY).first() or OrgUnit.objects.first()

            profile = Profile.objects.filter(email__iexact=email).first()
            if profile:
                profile.first_name = first_name
                profile.last_name = last_name
                profile.phone = phone
                profile.whatsapp = phone
                profile.network = network
                profile.preferred_locale = preferred_locale
                profile.org_unit = unit
                profile.country = unit.name if unit else ''
                profile.state_region = state_text
                profile.lga = lga_text
                profile.role_applied = role_considered
                profile.referral_code = norm_code
                profile.set_password(password)
                profile.save()
            else:
                profile = Profile.objects.create_user(
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    phone=phone,
                    whatsapp=phone,
                    birth_date=birth_date,
                    network=network,
                    preferred_locale=preferred_locale,
                    org_unit=unit,
                    country=unit.name if unit else '',
                    state_region=state_text,
                    lga=lga_text,
                    role_applied=role_considered,
                    referral_code=norm_code,
                    status=MemberStatus.APPLICANT,
                )

            CandidateActivation.objects.update_or_create(
                profile=profile,
                route='ref3',
                defaults={
                    'network': network,
                    'role': role_considered,
                    'referral_code': referrer_name or norm_code,
                    'status': 'in_progress',
                    'started_at': timezone.now(),
                    'deadline': timezone.now() + timedelta(days=3),
                }
            )
            if ref_obj:
                ref_obj.signups_count += 1
                ref_obj.save(update_fields=['signups_count'])

            login(request, profile, backend='django.contrib.auth.backends.ModelBackend')
            return redirect('activation:home')

    return render(request, 'accounts/doors.html', {
        'door_mode': 'referral_join',
        'page_title': f'{network} 3-Day Referral Activation',
        'network': network,
        'code': norm_code,
        'countries': countries,
        'states': states,
        'positions': positions,
        'error': error,
    })


def candidate_door_view(request):
    """Dedicated Candidate Sign-In Door (candidate.js — #/candidate)."""
    if request.method == 'GET' and request.user.is_authenticated:
        logout(request)

    error = None
    if request.method == 'POST':
        email = (request.POST.get('email') or '').strip().lower()
        password = request.POST.get('password') or ''
        user = authenticate(request, email=email, password=password)
        if user is not None:
            login(request, user)
            return redirect('activation:home')
        error = 'Invalid email or password. If you have not started your activation yet, choose WGMN or WNNN below.'

    return render(request, 'accounts/doors.html', {
        'door_mode': 'candidate',
        'page_title': 'Referral Activation Sign-In',
        'error': error,
    })


def referral_landing_view(request, code):
    """Public landing page for leader/vacancy referral links (refland.js — #/r/:code)."""
    ref = Referral.objects.filter(referral_code__iexact=code).select_related('referrer', 'org_unit').first()
    if ref:
        ref.views_count += 1
        ref.save(update_fields=['views_count'])
        request.session['wdos_ref_code'] = ref.referral_code

    role_label = get_role_title(ref.role_code, ref.network) if (ref and ref.role_code) else ''
    return render(request, 'accounts/doors.html', {
        'door_mode': 'refland',
        'page_title': 'You Have Been Invited to WODDI',
        'ref': ref,
        'code': code,
        'role_label': role_label,
    })


def volunteer_register_view(request, preset_network=None):
    """Public WODDI Volunteer Registration Door (volunteer.js — #/volunteer, #/wgmn, #/wnnn)."""
    countries = OrgUnit.objects.filter(level=OrgLevel.COUNTRY, is_active=True).order_by('name')
    stored_ref = request.session.get('wdos_ref_code', '')
    error = None
    success = False
    created_profile = None

    if request.method == 'POST':
        first_name = (request.POST.get('first_name') or '').strip()
        last_name = (request.POST.get('last_name') or '').strip()
        email = (request.POST.get('email') or '').strip().lower()
        phone = (request.POST.get('phone') or '').strip()
        age_band = (request.POST.get('age_band') or ('18-29' if preset_network == 'WNNN' else '30+')).strip()
        country_name = (request.POST.get('country') or '').strip()
        state_name = (request.POST.get('state') or '').strip()
        lga_name = (request.POST.get('lga') or '').strip()
        preferred_locale = (request.POST.get('preferred_locale') or 'en').strip()

        network = preset_network or (NetworkCode.WNNN if age_band == '18-29' else NetworkCode.WGMN)
        typo_err = check_email_typo(email)

        if not first_name or not last_name:
            error = 'First name and last name are required.'
        elif typo_err:
            error = typo_err
        elif Profile.objects.filter(email__iexact=email).exists():
            error = 'This email is already registered. Please sign in or claim your account.'
        else:
            unit = OrgUnit.objects.filter(name__iexact=country_name, level=OrgLevel.COUNTRY).first()
            if not unit:
                unit = OrgUnit.objects.filter(level=OrgLevel.COUNTRY).first()
            created_profile = Profile.objects.create_user(
                email=email,
                password=None,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                whatsapp=phone,
                network=network,
                preferred_locale=preferred_locale,
                org_unit=unit,
                country=country_name or (unit.name if unit else ''),
                state_region=state_name,
                lga=lga_name,
                referral_code=stored_ref,
                status=MemberStatus.APPLICANT,
            )
            if stored_ref:
                ref_obj = Referral.objects.filter(referral_code__iexact=stored_ref).first()
                if ref_obj:
                    ref_obj.signups_count += 1
                    ref_obj.save(update_fields=['signups_count'])
            success = True

    return render(request, 'accounts/doors.html', {
        'door_mode': 'volunteer',
        'page_title': f"{preset_network + ' ' if preset_network else ''}Volunteer Registration",
        'preset_network': preset_network,
        'countries': countries,
        'error': error,
        'success': success,
        'created_profile': created_profile,
    })


def claim_view(request):
    """Account Claim Wizard for approved applicants / directory members (claim.js — #/claim)."""
    step = request.POST.get('step', '1')
    email = (request.POST.get('email') or request.GET.get('email') or '').strip().lower()
    error = None
    matched_profile = None
    claim_state = None

    if request.method == 'POST':
        profile = Profile.objects.filter(email__iexact=email).first()
        app = Application.objects.filter(email__iexact=email).first()

        if step == '1':
            if not profile and not app:
                claim_state = 'not_found'
                error = 'No record found for that email. You can apply below or enter with a WODDI Volunteer ID.'
            elif profile and profile.volunteer_id and not profile.has_usable_password():
                claim_state = 'eligible'
                matched_profile = profile
                step = '2'
            elif profile and profile.has_usable_password() and profile.last_login:
                claim_state = 'has_account'
                error = 'This account has already been claimed. Please sign in with your password.'
            else:
                if not profile and app:
                    profile = Profile.objects.create_user(
                        email=app.email,
                        password=None,
                        first_name=app.first_name,
                        last_name=app.last_name,
                        phone=app.phone,
                        network=app.network,
                        org_unit=app.org_unit,
                        status=MemberStatus.APPROVED if app.status == 'approved' else MemberStatus.APPLICANT,
                    )
                matched_profile = profile
                claim_state = 'eligible'
                step = '2'

        elif step == '2':
            password = request.POST.get('password') or ''
            confirm = request.POST.get('confirm_password') or ''
            if not profile:
                error = 'Account record could not be located.'
                step = '1'
            elif len(password) < 8:
                error = 'Password must be at least 8 characters.'
                matched_profile = profile
            elif password != confirm:
                error = 'Passwords do not match.'
                matched_profile = profile
            else:
                profile.set_password(password)
                profile.is_active = True
                profile.save()
                login(request, profile, backend='django.contrib.auth.backends.ModelBackend')
                return redirect('onboarding:dashboard')

    return render(request, 'accounts/doors.html', {
        'door_mode': 'claim',
        'page_title': 'Claim Your WODDI Account',
        'step': step,
        'email': email,
        'matched_profile': matched_profile,
        'claim_state': claim_state,
        'error': error,
    })


def id_start_view(request):
    """Volunteer ID Lookup & First-Time Sign-In Door (idstart.js — #/id)."""
    step = request.POST.get('step', '1')
    idno = (request.POST.get('idno') or request.GET.get('id') or '').strip().upper()
    error = None
    hit = None
    claimed = False

    if idno:
        hit = (
            Profile.objects.filter(volunteer_id__iexact=idno).first()
            or Profile.objects.filter(membership_no__iexact=idno).first()
        )
        if hit:
            claimed = bool(hit.has_usable_password() and hit.last_login)

    if request.method == 'POST':
        if step == '1':
            if not hit:
                error = f"No leader or volunteer record matched ID '{idno}'."
            else:
                step = '2'
        elif step == '2' and hit:
            password = request.POST.get('password') or ''
            confirm = request.POST.get('confirm_password') or ''
            if claimed:
                user = authenticate(request, email=hit.email, password=password)
                if user:
                    login(request, user)
                    return redirect('onboarding:dashboard')
                error = 'Incorrect password for this WODDI ID.'
            else:
                if len(password) < 8:
                    error = 'Please choose a password of at least 8 characters.'
                elif password != confirm:
                    error = 'Passwords do not match.'
                else:
                    hit.set_password(password)
                    hit.is_active = True
                    hit.save()
                    login(request, hit, backend='django.contrib.auth.backends.ModelBackend')
                    return redirect('onboarding:dashboard')

    return render(request, 'accounts/doors.html', {
        'door_mode': 'id_start',
        'page_title': 'Enter with WODDI Volunteer ID',
        'step': step,
        'idno': idno,
        'hit': hit,
        'masked_email': _mask_email(hit.email) if hit else '',
        'claimed': claimed,
        'error': error,
    })
