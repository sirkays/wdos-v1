# PHASE 211 - Operations Centre for the Head of Field & Country Operations
Build v84.5 · db 164 · 29 Sep 2026. Database changes are ALREADY LIVE (applied through the Supabase connector). To deploy: drag `app` to both Netlify sites. Nothing to paste in the SQL Editor.

## Why
Regina (Head of Field & Country Operations) asked for access to the WDOS backend and an operations dashboard she can use to send messages to all leaders. Her account `regina@thewoddi.org` already opens the HOFCO dashboard, but that screen only showed totals: she could not see what each volunteer leader was doing, could not message more than one person at a time, and task assignment to leaders lived elsewhere.

## What she has now: the Operations Centre (`#/ops`)
Seven tabs, all from the database, all refused to anyone who is not HQ:

| Tab | What it does |
|---|---|
| Overview | 10 figures (leaders, active in 7 days, not seen in 30, never signed in, onboarding not finished, average activity score, tasks overdue, reports overdue, unread HQ messages, appointments not accepted), each clickable into the filtered list; engagement and score charts; leaders active each day; leaders by level; who needs support first (with one-click message); latest activity; by country |
| Leaders | Every seated volunteer leader (117 today) with last seen, sign-ins, onboarding progress, tasks, reports, unread HQ messages and a score out of 100. Search, filter by country, level, network and status, sort. Tick leaders (or "select all matching") to message them or assign a task. CSV export. Click a name for her full record: contact, seat, WODDI mailbox, onboarding checklist, tasks, reports, activity per week and a 90-day timeline, with Message, Assign task, Email and WhatsApp buttons |
| Activity | What leaders did, day by day, filterable by kind and period |
| Messages | Write once to one leader, a group (network, level, country, status) or everyone. Arrives in her WDOS Messages with a phone notification; optional email copy. History shows how many read it, email acceptance and replies; "Who read it" per message |
| Tasks | Assign a task (priority, due date, completion requirements, HQ approval) to one, some or all leaders; progress of every batch |
| Reports | Structured PDF reports (below) |
| Autopilot | Self-governing rules (below) |

Also: an Operations strip at the top of her HOFCO home, new sidebar entries (HOFCO; Founder, Secretary and Admin get Operations Centre and Reports), her "Assign" quick action now opens leader tasks, and a "Download report (PDF)" button on the Activation page.

## Reports with charts and plain explanations (PDF)
Three reports, each generated from live data and downloadable as an A4 PDF (with page numbers) or printed:
- **WDOS Operations Report** (7, 30, 90 or 180 days; one or both networks): 14 numbered sections, each with a chart and a "What this means" box: summary, who the leaders are, engagement, activity score, what leaders did, onboarding step by step, tasks, monthly reporting, communication from HQ, meetings and learning, by country, most active leaders, leaders who need support, autopilot actions, and how to read the report.
- **3-Day Referral Activation Report** and **7-Day Activation Report**: summary, referral forms, funnel from registration to appointment (names the biggest drop), where every candidate is now, day by day, timing, sign-ups, by position, country and source, messages to candidates, data quality, needs attention now, and the full candidate register.
The explanations are written from the same numbers as the charts, so they always agree. The PDF engine is bundled in the app (no outside service).

## Self-governance: Autopilot
Five rules WDOS applies on its own every morning at 07:05 Lagos time. **All are OFF** until Regina switches them on; each shows exactly who it would reach today before she does, and every action is written to a log.
1. Check in with leaders not seen for N days (default 14).
2. Onboarding reminders, weekly, starting N days after seating (default 7).
3. Overdue task reminders, repeating every N days (default 3).
4. Escalate tasks overdue by more than N days to her (default 7).
5. Weekly digest to her on a chosen weekday.
Tested live exactly as the scheduler runs it (then rolled back): the digest composed correctly and the onboarding rule would have reached 112 leaders. That number is why the rules start off.

## Activity score (out of 100)
Seen in the last 7 days 25 (12 if in the last 30), Leadership Pack onboarding 20, tasks not overdue 20, due reports submitted 20, HQ messages read 15. The last three count only after the leader has signed in at least once. My first version gave a never-used account 35/100 for having "nothing overdue"; that flattered the figures and is fixed (average today: 33 to 36, 46 leaders very weak).

## What the live data says today (29 Sep)
117 volunteer leaders (112 WGMN, 5 WNNN). 14 active this week, 46 have never signed in, 112 have not finished onboarding, 63 have not accepted their appointment in WDOS, 55 monthly reports overdue, and HQ has sent only 3 direct messages to leaders ever. No tasks have been assigned to leaders yet.

## Fonts and icons
Inter (the variable version, every weight) is self-hosted and set app-wide with X-style tuning; X's own typeface (Chirp) is proprietary, Inter is the closest open equivalent and was already the base. Font Awesome 7 Free is self-hosted; every icon in the app now uses it, and the HQ sidebars (which showed the same house icon on every line) now have one icon per destination. Both work offline.

## Security
Every `ops_*` function checks HQ inside and is not callable without signing in; the helpers are not callable at all. Tested as an ordinary leader: all refused. Demo accounts (`@woddi-demo.invalid`) are excluded from every figure, message and task. HQ sees the content of messages between a leader and HQ only; messages between leaders are counted, never shown.

## Data fixes made during the build
- Blank-string profile countries were counted as a country of their own.
- Two demo accounts seated on "Demo (retired)" were counted as leaders.
- "Newly seated" counted seats that had since ended.

## Needs a decision from you, not code
- **Regina has three accounts.** `regina@thewoddi.org` (HQ, HOFCO: the one to use), `reginaokoro26@gmail.com` (no role) and `uchechukwuokori81@gmail.com` (seated as a Country Representative on the HQ unit, so she appears in her own leaders list and is one of the 15 parked seats). I have not changed any of them.
- **"WDOS backend" and "WODDI Institute backend"**: inside WDOS she has the full HQ operations view. Supabase dashboard access and the Institute's admin are outside this app; they need an invite from you on those platforms.

## Files
- `supabase/migrations/164_operations_centre.sql` (applied live; record only, with the same-day patches a to e at the end).
- New: `app/js/pages/ops.js`, `app/js/pages/opsreport.js`, `app/js/components/charts.js`, `app/vendor/fontawesome/`, `app/vendor/html2pdf/`, `app/assets/fonts/inter-latin(-ext)-wght-normal.woff2`.
- Changed: `app/js/components/icons.js` (Font Awesome), `layout.js` and `vshell.js` (route icons), `hofco.js`, `hqactivation.js`, `app.js`, `db.js` (wrappers, schema 164, v84.5), `sw.js`, `index.html`, `assets/hq-sidebars.json`, `assets/css/wdos.css`, `locales/en.json` and `fr.json` (258 new keys each). Old static Inter files removed.

## v84.6 hotfix (29 Sep 2026): v84.5 did not start (endless spinner)
**Cause (my error):** v84.5 created a new chart module at `js/components/charts.js`, a filename that already existed. The original exports `donut`, `bars` and `line`, used by the Reports page (`reports.js`), which `app.js` loads at start-up. Replacing it removed those exports, the browser refused the whole module graph, and the app never started for anyone. My render tests had replaced the page shell with a stand-in, so they never loaded `app.js` and missed it.
**Fix:** the original `charts.js` is restored byte for byte (recovered from the recorded diff; identical to the v80.2 copy). The Operations Centre charts now live in `js/components/opscharts.js`.
**Checks added:** (1) an import checker that confirms every name imported anywhere in the app is exported by its file (1,136 names, 90 modules, 0 problems; it flags exactly this bug on the v84.5 files); (2) an end-to-end run of the real app, with every module, signed in as Regina and as a volunteer leader, answering database calls from live data: home, Operations Centre, leaders, report generation, Activation, Mailboxes, leader home, all with zero errors.
**Also fixed:** the start-up guard (`guardian.js`) counted the boot spinner as "drawn", so a failed start showed an endless spinner instead of its rescue screen. It now shows "WDOS did not finish loading" with the captured error and a Repair button (after 8 s when an error was thrown, otherwise after 25 s). HOFCO home strip buttons that rendered white on white, the highlighted sidebar item losing its icon, and a plain "This page is for WODDI Headquarters" message for a non-HQ user who opens `#/ops`.
**After deploying:** anyone who opened the site during the v84.5 window may need to reload once or twice (the new build installs in the background on the first visit, then takes over).
