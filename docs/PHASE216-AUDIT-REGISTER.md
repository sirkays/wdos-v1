# PHASE 216 - WDOS audit: bugs, corrections and gaps
Build v85.1 · db 168 · 2 Oct 2026. Database changes 166-168 are ALREADY LIVE (applied through the Supabase connector). To deploy the app: extract `wdos-v85.1-update.zip` over your `app` folder, replace files, then drag `app` to both Netlify sites. The pack also contains v85.0 (candidate sign-in loop).

## How this audit was done
Evidence first, from four sources:
1. **Live logs, last 24 hours:** every failed request, every database error message, account-service calls and email delivery.
2. **The database itself:** Supabase security and performance advisors, all 14 scheduled jobs, and data-quality checks.
3. **A scan of the whole app (92 modules):**
   - every database function and table the code calls, checked against the live database;
   - every link, checked against the routes;
   - every translation key and every value that builds one;
   - every file the offline cache needs.
4. **What real users failed at today**, traced person by person.

Each bug below was reproduced in a browser before it was fixed, then retested, along with all earlier scenarios.

## A. Bugs fixed

| # | What people experienced | Cause | Fix | Evidence |
|---|---|---|---|---|
| A1 | **Security:** 29 privileged database functions could be called by anyone on the internet with the public key that ships in the app, and had no check of who was calling. Some change data (start or finish a candidate's activation, change a member's status, copy directory data onto a profile); some return data (lists of people, unit report data, task data, onboarding records); one takes 11 s and could be used to slow WDOS down. | Default database permissions were never narrowed for these helpers. | Migration 166: the 22 internal helpers are locked to the system; the 7 the app uses when signed in are closed to anonymous callers. Public-by-design functions (referral form, claim, password reset, ID sign-in, country lists) are unchanged. | Tested live: an anonymous call is refused ("permission denied"); the referral form still works; signed in as Regina the same function returns 30 people; the scheduled jobs still run. |
| A2 | A leader's dashboard bounced between the dashboard and the sign-in form, calling the database about twice a second. Seen live at 08:06 on 2 Oct: about 50 calls in 35 s from one browser. | **My error (v84.7):** when a token refresh failed for a moment, `getSession()` handed back the stored session even after its token had expired. The page thought it was signed in, the database said "Not signed in", and the two pages kept redirecting to each other. | The stored session is used only while its token is still valid. New loop breaker: if pages redirect more than 10 times in 4 s, WDOS stops, says so, and offers Try again and Sign in. | Reproduced: 49 anonymous calls in 20 s on v85.0. Fixed: 0, and she lands on the sign-in form. Loop breaker tested. |
| A3 | **View as** (Accounts) did not work properly. Viewing an HQ person (for example Regina) showed a volunteer dashboard instead of her HQ screen. Viewing a leader showed no country figures ("No leadership unit" 12 times today). | The page asked the database for a column that does not exist (`profiles.avatar_updated_at`), so the person being viewed never loaded. The leader dashboard then asked for the viewer's own country (HQ has none) instead of the viewed leader's. Introduced in the Phase 171 View-as work. | Only real columns are requested; in View as, the dashboard asks for the viewed leader's unit. | Database error log, 14:51 to 14:52. |
| A4 | People marked as leaders but with no seat met raw database messages on Reporting ("You do not hold a leadership seat; reports belong to a leadership unit") and My leadership structure ("Not allowed"). Example today: Folakemi Kayode-ojo, Nigeria, LGA coordinator applicant, no seat. | The refusals are correct; the app showed them as they came. | New `plainError()` turns the known refusals into plain sentences (for example "This part of WDOS is for appointed leaders. It opens once HQ appoints you..."). English and French. | Tested in the browser. |
| A5 | Candidates were signed out straight after signing in (Uganda candidate, 5 times, 14:01 to 14:04). | My error (v84.7): see Phase 215. | v85.0, included in this pack. | Phase 215. |

## B. Corrections made

| # | What | Done |
|---|---|---|
| B1 | The HQ dashboard cache was rebuilt every 3 minutes around the clock: 6 dashboards, 480 runs a day, about 92 minutes of database time daily. | Migration 167: every 10 minutes, and the dashboards accept a copy up to 10 minutes old. About 70% less load. |
| B2 | 25 profiles had a blank country (and some a blank state), counted as a "country" of their own in lists and filters. | Migration 168: set to empty (NULL). |
| B3 | 68 French texts were still in English: country rep home, country home, tasks, engagement, delegations and HQ screens. | Translated (placeholders kept). |
| B4 | Burundi CR's surname (Phase 214). | Done earlier today (165). |

## C. Corrections that need your decision (data about real people)

| # | Finding | Recommendation |
|---|---|---|
| C1 | **Kaltume Vogadika (Taraba State Coordinator):** her seat is on `kvogadika@gmail.com`, which has never signed in. She uses `vogadikakaltume@gmail.com` (no seat), so WDOS shows her no leader tools. | Move the seat to the account she uses (merge the two). Say the word and I will do it. |
| C2 | **15 seats parked on the WODDI HQ unit**, including Chioma Okereke (CR), Bilikisu Lawal (DCR), and Regina's second account `uchechukwuokori81@gmail.com` as CR. | Each needs its real country, or should be ended. |
| C3 | **194 people marked activated or approved as leaders, with no seat and no live activation**; 189 have signed in. | Appoint those confirmed; the others should know they are awaiting appointment. The app now explains this instead of showing errors (A4). |
| C4 | **Duplicate accounts:** Regina (3); Mfon Nta (3: `mfon@thewoddi.org` holds the HQ seat); Victoria Nakalanzi (2, one with the mistyped email `@gmail.con`); "INERNAL TEST" (2 test accounts); Craig Funds (2, test). | Merge or remove; mark test accounts as test so they leave the figures. |

## D. Gaps (not fixed in this round)

| # | Gap | Why it matters | Suggested next step |
|---|---|---|---|
| D1 | The ID sign-in (`#/id`) returns a member's full email for an ID number. | ID numbers follow a pattern, so names and emails can be collected by guessing. | Move ID sign-in into an Edge Function, so the email never reaches the browser. |
| D2 | 7 functions the app uses when signed in have no check inside of who is calling: directory_seat_target, resolve_bulk_recipients, reporting_reminders_run, engagement_roll, onboarding_evidence, report_validate, task_batch_summary. | Any signed-in leader could call them directly; resolve_bulk_recipients lists people. | Add an HQ check inside each. |
| D3 | About 160 other privileged functions are still callable without signing in. They do check the caller inside. | Defence in depth. | Map each public page's calls, then close the rest to anonymous callers. |
| D4 | Leaked-password protection is off in Supabase Auth. | Leaders can choose a password already exposed in a breach. | Supabase dashboard > Authentication > password settings. |
| D5 | Performance: 83 access rules re-check the user on every row; 87 links between tables have no index; 1 duplicate index (the drop kept waiting on a lock). | Fine at today's size, slower as data grows. | One optimisation pass before the next big intake. |
| D6 | 33 functions without a fixed search path; the pg_net extension sits in the public schema. | Low risk, advisor warnings. | Tidy in the same pass. |
| D7 | Adoption: of 116 seated leaders, 45 have never signed in, 101 have not started onboarding and 5 have finished. | Mailboxes and the full workspace stay locked until onboarding is done. | Regina: Autopilot onboarding reminders (currently off), and resend login details to the 45. |

## What was checked and found clean
- All 185 database functions and 69 tables the app calls exist.
- No dead links.
- All 274 files the offline cache needs exist.
- Every role, status, HQ function and task state has a label in English and French.
- None of the 14 scheduled jobs failed in the last 24 hours.
- Account-service calls all answered OK.
- Every email sent was accepted by Brevo.
- Nobody holds two seats; every seat has a login.
- No candidate is stuck past their deadline.

## Tests rerun on v85.1 (all passing)
- End-to-end pages as Regina (7 pages) and as a leader, with zero errors.
- Onboarding gate and candidate gate.
- Phase 214 onboarding (Chad and Osun cases) and Google sign-in.
- Phase 215 candidate loop.
- Phase 212 clock-fast sign-in, stale sign-in form, and return to page after sign-in.
- Phase 213 account-service cases.
- New: expired-token loop, loop breaker, plain refusals.
- Import checker: 1,153 names, 92 modules, 0 problems.

## Files
- Database (live; records in `supabase/migrations/`):
  - `166_lock_unguarded_definer_functions.sql`
  - `167_dashboard_cache_every_10_min.sql`
  - `168_blank_country_to_null.sql`
- App:
  - new `js/core/plainerror.js`
  - `js/core/db.js` (stored session only while valid, v85.1, schema 168)
  - `js/core/router.js` (loop breaker)
  - `js/app.js` (View as columns)
  - `js/pages/home.js` (View as unit)
  - `js/pages/reporting.js`, `js/pages/structure.js` (plain refusals)
  - `locales/en.json` and `fr.json` (7 new keys; 68 French translations)
  - `sw.js` (wdos-v85.1)
  - `index.html`
