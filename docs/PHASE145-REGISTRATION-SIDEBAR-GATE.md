# PHASE 145 - Registration v2, network forms, sidebar structure, onboarding gate
Build v70.0 · db 116 · 8 Sep 2026

## Registration
- Two network-specific doors with their own links: **woddicrm.org/wgmn** and
  **woddicrm.org/wnnn** (Netlify redirects to #/wgmn and #/wnnn). WGMN shows the
  WODDI "the nurturer" logo and the WGMN logo; WNNN shows the WODDI logo and a
  WNNN mark (no WNNN logo file exists yet; supply one and it drops in). Each form
  offers only its network's age range.
- Language bar at the top in the founder's order: English, Français, Português,
  العربية, Kiswahili (built-in en/fr; AI-built pt/ar/sw interface packs).
- Fields: full name, email, phone (mandatory, checked in the form and in the
  database), age range, country (list), state/region (Nigeria states suggested),
  preferred language (the country's three main languages listed first, first one
  pre-selected; 55 countries mapped), profile photo (JPG/PNG under 5 MB), about.
- The photo is stored at registration under a hash of the applicant's email and
  moved onto her profile the first time she signs in (migration 116 bucket
  pending-photos + adoptPendingPhoto on boot). Country, state and preferred
  language are carried onto the profile when the login is created (trigger).
- The room's "My language" defaults to the profile's preferred language, so a
  member hears the interpreter in the language she chose at registration.

## Dashboard
- Volunteer role is read-only on the profile (set by HQ).
- A bold network banner on the dashboard: WGMN LEADERSHIP DASHBOARD · Good Mother
  Network (with logo) or WNNN LEADERSHIP DASHBOARD · Nurture NextGen Network.
- Sidebar restructured into the founder's 17 sections (Dashboard, My Leadership
  Structure, Recruitment, Tasks & Follow-Up, Reports, Meetings, Programmes &
  Activities, WODDI Institute, Members, Communications, Safeguarding & Escalations,
  Performance, Documents & Resources, Country Directory, Help & Support, My
  Onboarding, My Profile). Each entry points at the existing screen closest to
  the section; sections whose full content is not built yet (Performance score,
  Country Directory beyond the structure page, Institute learner overview) point
  at the nearest screen.
- **Gate**: a seated leader who has not ticked "Read the Volunteer Leadership
  Pack" on My Onboarding can open only Dashboard, My Onboarding, Profile,
  Documents & Resources, Support, Help and Settings. Every other menu item shows
  a lock and any other route returns her to My Onboarding with a notice. HQ
  View-as is not gated.

## Deploy
Run 116_registration_v2.sql, drag `app` to both Netlify sites → badge v70.0 · db 116.
Netlify picks up the /wgmn and /wnnn redirects from netlify.toml on the same drop
only if netlify.toml is inside the deployed folder; it is at the package root, so
drag the package root (app + netlify.toml) or add the two redirects in Netlify →
Site configuration → Redirects. Until then #/wgmn and #/wnnn work directly.

## Not in this build (the founder's 2:00 PM letter)
Referral Review Leadership Package and tester, selection and non-selection letter
templates with automatic sending, the 7-day activation, and the volunteer
engagement and retention module. Each is a separate build.
