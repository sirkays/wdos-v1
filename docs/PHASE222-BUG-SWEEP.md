# PHASE 222 - Bug sweep after v85.7 went live
Build v85.8 · db 172 · 3 Oct 2026. Database change 172 is ALREADY LIVE (applied through the Supabase connector). To deploy the app: extract `wdos-v85.8-app.zip` and drag the `app` folder inside it to both Netlify sites.

## How the sweep was done
1. **Live logs, last 24 hours:** every failed request, every database error, sign-ins and the Edge Function.
2. **The database:** security advisors and the 13 scheduled jobs.
3. **A scan of the whole app (93 modules), checked inside the live database:**
   - every database function the app calls, with the exact parameter names it sends, and whether a signed-in user may run it;
   - every table column it reads or writes;
   - every translation key, link and offline-cache file.
4. **Every page in a browser**, with figures captured from the live database:
   - 34 HQ pages as Regina (HOFCO) and the Command Centre as Founder / Executive;
   - 14 pages as a Deputy Country Representative.
   - Anything broken on screen was flagged: raw keys, "NaN", "undefined", error text.
5. **Your screenshot**, number by number against the database.

## A. Bugs fixed

| # | What people saw | Cause | Fix |
|---|---|---|---|
| A1 | **People directory (#/members) would not open.** | The page asks the `field_members` view for country, HQ function, state, LGA, position and leader flag, and the view never had them ("column field_members.hq_function does not exist"). Broken since those columns were added to the member list, before v84.7. My v85.2 change added LGA to the same list. | Migration 172: the view gains the six columns. Tested under Regina's access rules: 507 people listed. |
| A2 | **Two figures for vacant CR / DCR seats:** the tile said 8, "Immediate attention" said 16, and the Structure page the tile opens lists 16. | The tile skipped countries that have a WDOS unit but no leader yet: Morocco, Republic of the Congo, Rwanda and Tunisia (2 seats each). | Tile and list use one rule: 16. WNNN view: 50 and 50. |
| A3 | **"Reports due (this period)" said 54**, while the Reporting card below it expects 59. | The tile counted top seats only. A unit led only by a deputy or assistant still owes its report. | Both count units with a seated leader: 59. |
| A4 | **"483 members (414 WGMN · 68 WNNN)"**, which adds up to 482. | One account has no network: Eddy (eddy@thewoddi.org), whose surname is the placeholder "SURNAME_HERE". | The line now ends "· 1 with no network" while such accounts exist. |
| A5 | **"Active leaders 119"** meant every leader in a seat, while HOFCO's "Active" means signed in within 30 days (49). | Same word, two meanings. | Command Centre tile: "Leaders in seats 119 · 49 active in the last 30 days". |
| A6 | **Activation figures counted the retired 14-day journey.** "Activation pending 1", and the referral funnel showed "Referral 0 … 3-Day activation 1", a stage larger than the one before it. | The figures still read `activation_journeys`. The 3-day and 7-day activations live in `candidate_activations`. | They now count live activations, with test candidates left out. Activation pending: 2. Referral funnel: 7 referred, 7 contacted (an email was sent), 2 in 3-day activation, 0 in review. "Activation pending" now opens Activation & Readiness. |
| A7 | **"Live · refreshed 9:39 · updates every minute"** | That was the time the page opened. The figures are recalculated every 10 minutes. | "Figures as of 10:05 · recalculated every 10 minutes", using the time they were calculated. |
| A8 | **Funnel rows misaligned**, and a stage with 0 still drew a bar. | Each row was its own grid, so each number sat where its label length put it. A 14% minimum bar was drawn for zero. | One grid for the whole funnel: bars, numbers and labels line up, and zero shows an empty track. Same on the WGMN and WNNN pages. |
| A9 | **The ninth tile wrapped onto a row of its own.** | The grid had 8 columns for 9 tiles. | One row of nine on wide screens, 3 x 3 on medium screens. |
| A10 | **Network Command: "Countries with leaders NaN"**, always. | The value "22/26" was passed through the number formatter. | Shows 22/26. |
| A11 | **HOFCO dashboard, Recent network activity: "role.monthly_leadership"** | A report template was translated as if it were a role. | "Monthly Leadership & Performance Report". |
| A12 | **The retired 14-day journey still started by itself.** On 2 Oct it opened one for Abubaida Uthuman, a 3-day referral candidate from Uganda. On 16 Oct it would have marked him "lapsed". | The autostart rule from the 14-day era was still switched on. | Turned off (migration 172). Removing his stray record needs your OK: the database tool refuses deletes without the owner's confirmation. |
| A13 | **Dates shown one day early** for anyone west of UTC (Cape Verde, or an HQ member travelling). | A plain date like 2026-09-01 was read as midnight UTC. | Read as a calendar day. Found because the test computer runs on US Pacific time; no effect in Africa's time zones. |
| A14 | French HOFCO tile showed "signed in within 30 days" in English. | Untranslated. | "connectées au cours des 30 derniers jours". |

The database part of A1 to A6 and A12 is already live, so the current v85.7 site already shows the corrected figures (16, 59, 2 and the referral funnel). v85.8 adds the labels, layout and page fixes.

## B. Checked and clean
- **Live logs today (to 09:40):**
  - 332 requests from real users, none failed;
  - no database error from a real user since the 2 Oct fixes.
- **Scheduled jobs:** all 13 ran; 0 failures in 24 hours.
- **Database functions:** all 197 the app calls exist, the parameter names match, and signed-in users may run them.
- **Table columns:** all 458 the app reads or writes exist, except `field_members` (A1).
- **Translations, links and cache:**
  - 3,156 translation keys: none missing in English, French complete;
  - no dead links;
  - all 277 offline-cache files exist.
- **Every page in a browser:** none of the 48 pages shows an error, raw text or a stuck spinner.

## C. For your decision (data about real people)

| # | Finding | Suggestion |
|---|---|---|
| C1 | **"Demo (retired)"** is still an active country unit with Regina seated as its leader. It is counted as a country in Structure (26 units), Reporting compliance (22 expected) and Network Command (22/26). | End that seat and switch the unit off. Say the word and I will. |
| C2 | **Test records inside live figures:** overdue tasks such as "gfgfgfg" and "Vvhghh" (part of the 8 overdue), and 2 people in "Banana Republic" in Engagement. Test candidates are already excluded. | Close or delete the test tasks and test people. |
| C3 | **Eddy (eddy@thewoddi.org):** surname "SURNAME_HERE", no network. | Give the real surname and a network, or mark as staff. |
| C4 | **Abubaida Uthuman:** stray 14-day journey (A12), and his profile status is "approved" while other candidates are "applicant". | Approve the delete; status as you decide. |
| C5 | Network Command "Members 519" counts everyone registered, including applicants. The Command Centre's 483 counts members past application. | Both are right. I can rename one if the same word confuses. |

## D. Still open from Phase 216 (not changed today)
- **D1:** ID sign-in returns the email.
- **D2 to D3:** functions callable without signing in (they check the caller inside).
- **D4:** leaked-password protection off.
- **D5 to D6:** performance and tidy-up warnings.
- **Security headers:** not active on drag-and-drop deploys.
- **Avatar requests:** the Accounts page asks for a photo for every person, and about 350 come back "not found" (people without photos fall back to initials). Harmless.

## Tests (all passing on v85.8)
- **Upgrade:** the live v85.7 upgrades to v85.8 with service workers on, in one automatic reload; a first-time visitor gets the dashboard.
- **Pages:**
  - Regina's pages and a leader's pages with zero errors;
  - the Command Centre with live figures (screenshot checked).
- **Earlier phases:**
  - Phase 218 downloads (PDF, CSV, Excel) and profile tab;
  - onboarding and Google sign-in;
  - candidate sign-in loop and loop breaker.
- **Import checker:** 1,158 names, 93 modules, 0 problems.
- **Netlify detection on the uploaded folder:** no framework, nothing to build.

## Files
- **Database:** `supabase/migrations/172_bug_sweep_command_centre_and_people_directory.sql` (live)
- **App:**
  - `js/pages/central.js`, `js/pages/networkhq.js`, `assets/css/wdos.css`: tiles, strip, funnel, time stamp (A2 to A9);
  - `js/pages/command.js`: A10;
  - `js/pages/hofco.js`: A11;
  - `js/core/i18n.js`: A13;
  - `locales/en.json`, `locales/fr.json`: 3 new keys and 2 updated;
  - `js/core/db.js`, `sw.js`, `index.html`: v85.8, db 172.
