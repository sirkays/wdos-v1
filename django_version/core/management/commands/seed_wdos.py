import os
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from core.models import (
    OrgUnit, Profile, RoleAssignment, Department, Staff,
    OrgSetting, OrgLevel, RoleCode, NetworkCode, MemberStatus
)
from operations.models import (
    Task, Meeting, Announcement, ActivationDay, ActivationItem,
    Priority, TaskStatus, MeetingMode, MeetingStatus
)


class Command(BaseCommand):
    help = 'Seeds initial WDOS organisational hierarchy, executive leadership, staff, and sample operational records.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Beginning WDOS database seeding..."))

        # 1. HQ and Org Units
        hq, _ = OrgUnit.objects.get_or_create(
            level=OrgLevel.HEADQUARTERS,
            defaults={'name': 'WODDI Headquarters', 'country_iso': 'NG', 'is_active': True}
        )

        countries_data = [
            ('Nigeria', 'NG', [
                ('Lagos State', ['Ikeja Chapter', 'Surulere Chapter', 'Eti-Osa Chapter']),
                ('Imo State', ['Owerri Municipal Chapter', 'Mbaitoli Chapter']),
                ('Federal Capital Territory', ['Abuja Central Chapter', 'Gwarinpa Chapter']),
                ('Rivers State', ['Port Harcourt Chapter']),
            ]),
            ('Kenya', 'KE', [
                ('Nairobi County', ['Nairobi Central Chapter', 'Westlands Chapter']),
                ('Mombasa County', ['Mombasa Island Chapter']),
            ]),
            ('Ghana', 'GH', [
                ('Greater Accra', ['Accra Metropolitan Chapter']),
                ('Ashanti Region', ['Kumasi Central Chapter']),
            ]),
            ('Rwanda', 'RW', [
                ('Kigali City', ['Nyarugenge Chapter', 'Gasabo Chapter']),
            ]),
            ('Burundi', 'BI', [
                ('Bujumbura Mairie', ['Bujumbura Central Chapter']),
            ]),
            ('South Africa', 'ZA', [
                ('Gauteng', ['Johannesburg Chapter']),
            ]),
        ]

        unit_cache = {'hq': hq}

        for c_name, iso, states in countries_data:
            country_unit, _ = OrgUnit.objects.get_or_create(
                name=c_name, level=OrgLevel.COUNTRY,
                defaults={'parent': hq, 'country_iso': iso, 'is_active': True}
            )
            unit_cache[c_name] = country_unit

            for s_name, chapters in states:
                state_unit, _ = OrgUnit.objects.get_or_create(
                    name=s_name, level=OrgLevel.STATE_REGION,
                    defaults={'parent': country_unit, 'country_iso': iso, 'is_active': True}
                )
                unit_cache[s_name] = state_unit

                for ch_name in chapters:
                    OrgUnit.objects.get_or_create(
                        name=ch_name, level=OrgLevel.CHAPTER,
                        defaults={'parent': state_unit, 'country_iso': iso, 'is_active': True}
                    )

        self.stdout.write(self.style.SUCCESS(f"Org hierarchy populated ({OrgUnit.objects.count()} units)."))

        # 2. Departments
        depts = ['Executive Office', 'Programmes', 'Administration', 'Technical Delivery', 'Communications & Media', 'Finance']
        dept_cache = {}
        for d in depts:
            dept_obj, _ = Department.objects.get_or_create(name=d)
            dept_cache[d] = dept_obj

        # 3. Super Admin & Executive Users
        users_to_seed = [
            {
                'email': 'admin@thewoddi.org',
                'first_name': 'Super',
                'last_name': 'Administrator',
                'role': RoleCode.SUPER_ADMIN,
                'is_staff': True,
                'is_superuser': True,
                'unit': hq,
                'dept': 'Executive Office',
                'title': 'System Administrator'
            },
            {
                'email': 'zinaria@thewoddi.org',
                'first_name': 'Zinaria Nneoma Nkechi Rochas',
                'last_name': 'Okorocha',
                'membership_no': 'WODDI-HQ-001',
                'role': RoleCode.SUPER_ADMIN,
                'hq_function': 'founder',
                'is_staff': True,
                'is_superuser': True,
                'unit': hq,
                'dept': 'Executive Office',
                'title': 'Founder & Chairperson'
            },
            {
                'email': 'belinda@thewoddi.org',
                'first_name': 'Belinda Ujunwa',
                'last_name': 'Ezeofor',
                'membership_no': 'WODDI-HQ-002',
                'role': RoleCode.EXECUTIVE_DIRECTOR,
                'hq_function': 'director',
                'is_staff': True,
                'unit': hq,
                'dept': 'Executive Office',
                'title': 'Executive Director'
            },
            {
                'email': 'regina@thewoddi.org',
                'first_name': 'Regina',
                'last_name': 'Okoro',
                'membership_no': 'WODDI-HQ-003',
                'role': RoleCode.HQ_TEAM,
                'hq_function': 'hofco',
                'is_staff': True,
                'unit': hq,
                'dept': 'Programmes',
                'title': 'Head of Field & Country Operations (HOFCO)'
            },
            {
                'email': 'aziz@thewoddi.org',
                'first_name': 'Azeez',
                'last_name': 'Razak',
                'membership_no': 'WODDI-HQ-004',
                'role': RoleCode.HQ_TEAM,
                'hq_function': 'it',
                'is_staff': True,
                'unit': hq,
                'dept': 'Technical Delivery',
                'title': 'IT Lead'
            },
            {
                'email': 'ngozi@thewoddi.org',
                'first_name': 'Ngozi',
                'last_name': 'Adeleke',
                'membership_no': 'WODDI-NG-001',
                'role': RoleCode.COUNTRY_REP,
                'unit': unit_cache['Nigeria'],
                'network': NetworkCode.WGMN,
            },
            {
                'email': 'amina@thewoddi.org',
                'first_name': 'Amina',
                'last_name': 'Mwangi',
                'membership_no': 'WODDI-KE-001',
                'role': RoleCode.COUNTRY_REP,
                'unit': unit_cache['Kenya'],
                'network': NetworkCode.WGMN,
            },
            {
                'email': 'chioma@example.com',
                'first_name': 'Chioma',
                'last_name': 'Okonkwo',
                'membership_no': 'WODDI-NG-042',
                'role': RoleCode.MEMBER,
                'unit': unit_cache['Lagos State'],
                'network': NetworkCode.WGMN,
            },
            {
                'email': 'fatima@example.com',
                'first_name': 'Fatima',
                'last_name': 'Bello',
                'membership_no': 'WODDI-NG-088',
                'role': RoleCode.MEMBER,
                'unit': unit_cache['Federal Capital Territory'],
                'network': NetworkCode.WNNN,
            },
        ]

        default_pw = os.environ.get('WDOS_SEED_PASSWORD', 'admin123')   # set WDOS_SEED_PASSWORD on any public deployment

        for u in users_to_seed:
            profile = Profile.objects.filter(email=u['email']).first()
            if not profile:
                profile = Profile.objects.create_user(
                    email=u['email'],
                    password=default_pw,
                    first_name=u['first_name'],
                    last_name=u['last_name'],
                    membership_no=u.get('membership_no'),
                    network=u.get('network', NetworkCode.WGMN),
                    status=MemberStatus.ACTIVE,
                    org_unit=u.get('unit'),
                    is_leader=u.get('role') not in (RoleCode.MEMBER, RoleCode.VOLUNTEER),
                    hq_function=u.get('hq_function'),
                    is_staff=u.get('is_staff', False),
                    is_superuser=u.get('is_superuser', False),
                )
                self.stdout.write(f"Created account: {profile.email} (Password: {default_pw})")
            else:
                profile.set_password(default_pw)
                profile.save()

            if u.get('role'):
                RoleAssignment.objects.get_or_create(
                    profile=profile,
                    role=u['role'],
                    org_unit=u.get('unit') or hq,
                    defaults={'starts_at': timezone.now()}
                )

            if u.get('dept') and u.get('title'):
                Staff.objects.get_or_create(
                    profile=profile,
                    defaults={
                        'department': dept_cache[u['dept']],
                        'position_title': u['title'],
                        'is_active': True
                    }
                )

        # 4. Activation Days & Items
        day1, _ = ActivationDay.objects.get_or_create(seq=1, defaults={'title': 'Day 1 â€” Welcome & Foundations', 'description': 'Introduction to WODDI and network ethos.'})
        day2, _ = ActivationDay.objects.get_or_create(seq=2, defaults={'title': 'Day 2 â€” Leadership Responsibilities', 'description': 'Community engagement and operational reporting.'})
        day3, _ = ActivationDay.objects.get_or_create(seq=3, defaults={'title': 'Day 3 â€” Safeguarding & Readiness Assessment', 'description': 'Final readiness assessment.', 'has_assessment': True})

        ActivationItem.objects.get_or_create(
            day=day1, seq=1,
            defaults={
                'prompt': 'What is the core motto of WODDI?',
                'item_type': 'multiple_choice',
                'options': ['No Woman Is Left Out', 'Women First', 'Empower Every Family', 'Stronger Together'],
                'correct_option': 'No Woman Is Left Out'
            }
        )

        # 5. Sample Tasks
        founder = Profile.objects.filter(email='zinaria@thewoddi.org').first()
        director = Profile.objects.filter(email='belinda@thewoddi.org').first()
        it_lead = Profile.objects.filter(email='aziz@thewoddi.org').first()

        if founder and director:
            Task.objects.get_or_create(
                title='Review Pan-African Expansion Roadmap (Q4 2026)',
                defaults={
                    'details': 'Review candidate activation and community mobilisation metrics across all six countries.',
                    'org_unit': hq,
                    'assigned_to': director,
                    'assigned_by': founder,
                    'priority': Priority.HIGH,
                    'status': TaskStatus.IN_PROGRESS,
                    'due_on': timezone.now().date() + timedelta(days=7)
                }
            )

        if it_lead:
            Task.objects.get_or_create(
                title='Deploy WDOS Django Platform & Verify Zero-Downtime Migration',
                defaults={
                    'details': 'Verify Django REST endpoints, admin dashboard, and SPA compatibility.',
                    'org_unit': hq,
                    'assigned_to': it_lead,
                    'assigned_by': director or founder,
                    'priority': Priority.URGENT,
                    'status': TaskStatus.COMPLETED,
                    'completed_at': timezone.now()
                }
            )

        # 6. Sample Announcements
        Announcement.objects.get_or_create(
            title='Welcome to the WDOS Django Platform',
            defaults={
                'body': 'WDOS has been successfully ported to Django with full REST API support, comprehensive administration capabilities, and persistent database storage.',
                'org_unit': hq,
                'priority': Priority.URGENT,
                'author': founder
            }
        )

        # 7. Sample Meetings
        Meeting.objects.get_or_create(
            title='WODDI Pan-African Executive Alignment Session',
            defaults={
                'agenda': 'Review of national operations, membership milestones, and 2026 strategic objectives.',
                'org_unit': hq,
                'organiser': director,
                'mode': MeetingMode.VIRTUAL,
                'location': 'WODDI Virtual Room 1',
                'starts_at': timezone.now() + timedelta(days=2),
                'ends_at': timezone.now() + timedelta(days=2, hours=1, minutes=30),
                'status': MeetingStatus.SCHEDULED
            }
        )

        # 8. Org Settings
        OrgSetting.objects.get_or_create(key='app_version', defaults={'value': {'version': '85.8', 'flavor': 'django'}})
        OrgSetting.objects.get_or_create(key='motto', defaults={'value': {'text': 'No Woman Is Left Out'}})

        self.stdout.write(self.style.SUCCESS("WDOS database seeding completed successfully!"))
        self.stdout.write(self.style.NOTICE("Default credentials:"))
        self.stdout.write(self.style.NOTICE("  - Admin:   admin@thewoddi.org  /  admin123"))
        self.stdout.write(self.style.NOTICE("  - Founder: zinaria@thewoddi.org /  admin123"))
        self.stdout.write(self.style.NOTICE("  - Director: belinda@thewoddi.org / admin123"))
        self.stdout.write(self.style.NOTICE("  - IT Lead: aziz@thewoddi.org    /  admin123"))
