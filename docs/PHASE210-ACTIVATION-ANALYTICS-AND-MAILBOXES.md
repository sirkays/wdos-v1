# PHASE 210 - Activation analytics made accurate, Position mailboxes, API hardening
Build v84.4 · db 163 · 27 Sep 2026. Database changes are ALREADY LIVE (applied through the Supabase connector). To deploy: drag `app` to both Netlify sites. Nothing to paste in the SQL Editor.

## 1. What was wrong on the Activation page (v84.3) and what was done
Every figure was checked against the raw rows in the database before anything was changed.

| What the page said | What the database showed | Fix |
|---|---|---|
| Not started 0 | 5 of 9 registrations had never touched Day 1 (a step row is created at sign-up, so "step exists" was being read as "started") | New `step_has_activity()` (time spent, reached end, completed, answers or acknowledgements) and `first_activity_at` set once by trigger; "started" everywhere now means real activity |
| Day 1 "Reached 9" | 9 was the number of registrations, not Day 1 activity | Funnel counts activity per day; "opened" and "done" per day |
| Registrations counted people | Victoria Nakalanzi registered twice (second time as `vikkikajubi@gmail.con`, a typo); the internal test registrations were inside every total | `people` counted separately from `registrations` (same name or same phone = one person); a Duplicates list; a Data quality section |
| Test records in the statistics | "INERNAL TEST" (x2) and "Ade Test" were counted as candidates | `candidate_activations.is_test` + `hq_activation_set_test()`; HQ can mark or unmark any record from its detail; test records leave every figure, get no emails and cannot be appointed. Those three were marked in this audit; unmark from the record if any is real |
| Incomplete + Pending shown together | An expired activation kept its assessment row at "pending" | Assessment shown as "Not submitted" when the activation is incomplete |
| Messages "sent" meant delivered | `send_email` returned true when the request was queued; the mailer's answer was never read | `send_email_req()` returns the request id; `comms_reconcile()` (cron every 5 min) writes the mailer's HTTP status back to the log; the page now says Accepted / Awaiting / Rejected / Unverified (older sends) |
| "Every candidate gets each message once" (my wording) | Reminders repeat daily until she acts (13 not-started reminders to 5 people) | Wording corrected on the page and in the locales; per-message table shows sends and people separately |
| Cluster coordinator appointment seated at LGA | `hq_appoint_candidate` did not create the cluster unit | Rewritten: country by ISO then name, creates state / LGA / cluster / chapter units as needed, refuses test records, puts other completed candidates for the same seat on reserve |
| No warning about typos in emails | `.con`, `gmial`, `@gmail.co` accepted | `email_problem()` in the database (flag on the register and in Attention) and the same check on the join form before an account is created |

### Live figures after the audit (3-Day route, test excluded)
6 registrations, 5 people (1 registered twice), 3 started (50%), 1 in progress (Victoria, on Day 3, window closes 28 Sep 10:21 UTC), 5 incomplete of which 3 never started, 0 assessments submitted, 1 mistyped email, 3 test records excluded. Trevor Achura's window closed 27 Sep 06:45 UTC and the "activation closed" email was accepted by the mailer (HTTP 201).

## 2. The new Activation & Readiness page (`#/hq/activation`)
Everything is computed in the database (`hq_activation_stats`, `hq_activation_register`, `hq_activation_candidate`); the browser counts nothing, so the page stays fast at 10,000 candidates.
- Route tabs (3-Day / 7-Day) with registration counts; "Include test records" switch; "Figures as of".
- The two referral forms (visits, registered, started, in progress, completed; copy link, WhatsApp, pause).
- **Attention now**: windows closing, never started, stalled (same day for more than 24 h), awaiting review, email problems, duplicates; most urgent first; Open jumps to the record.
- Activation errors (unchanged).
- At a glance: registrations, people, WGMN, WNNN, not started, in progress, awaiting review, decided, incomplete (of which never started), extension asked, returned, selected, reserve, further review, not selected, appointed; three rates (started, completed, completed of started).
- Where candidates drop off (funnel), how long things take (medians, on time / late, per-day medians), sign-ups last 30 days.
- Candidate communications with the mailer's answer; welcome coverage; per-message sends and people; undelivered; recent.
- By position, by country, by referral source, by state, day by day (opened / done / completion / median minutes).
- Data quality (duplicates, mistyped emails, test excluded).
- Candidates for the same seat, ranked (unchanged, test excluded) with Approve appointment.
- Candidate register: paged (50), server-side search / network / stage / country filters, flags on each row, full record on open (form, progress, activities with answers, messages to her, same-person registrations, errors), Mark as test, Review and Extension modals, CSV export (pages through the register).
- Position mailboxes summary with a link to `#/hq/mailboxes`.

## 3. Position mailboxes (the African structure emails)
Source: `WGMN_Africa_Volunteer_Leadership_Structure_Simplified_2.xlsx` (141,194 posts, 55 countries: national, state, LGA, ward; coordinator and assistant). Webmail: `https://9.qservers.net:2096/`.

**What is in the database now**
- `position_mailboxes`: 1,750 national + state mailboxes loaded and byte-verified per country (md5 over post id, address and decrypted password). Passwords are encrypted with a key held in Supabase Vault (`wdos_mailbox_key`); the table has RLS on with no policies and no grants, so no client can read it.
- The 139,444 LGA + ward rows are too large to move through the connector. They load in one browser step (2 minutes): Supabase dashboard, Table Editor, table `position_mailboxes_import`, Insert, Import data from CSV, pick `position_mailboxes_import.csv` (in the release folder). A BEFORE INSERT trigger encrypts each row into `position_mailboxes` and keeps nothing in the staging table. Matching to units runs every 15 minutes (`wdos_mailbox_resolve`).
- Matching: 752 posts matched to WDOS units today (50 national across 25 countries, 702 state); 101 are held by a seated leader; 4 are open now (Yorou Barkissou, Ngunan Addingi, Onyinyechi Anne Nwafor, Mandunh Mbohou Awawou); 97 are locked pending Leadership Pack onboarding. A 16-row alias table bridges spelling differences between the workbook and WDOS (Atakora/Atacora, Tombouctou/Timbuktu, Northern Cape typo, etc.).

**The rule (who can open a mailbox)** - `leader_gate_state()` + `my_position_mailbox()`
1. Only the leader seated on that exact post, signed in as herself. The RPC takes no profile id; it reads `auth.uid()`.
2. Her gate is open when HQ selected her at the end of her activation (3-Day or 7-Day), OR, for leaders seated before activations existed, when every required step of her Leadership Pack onboarding is done. HQ can close that second door with one switch on `#/hq/mailboxes` (`activation_only`).
3. Her position must be one that carries a mailbox: CR / DCR (national), SC / ASC (state), LGA coordinator / assistant, cluster or ward coordinator / assistant. Chapter roles and secretaries have none.
4. The password is fetched only when she presses Show; every reveal is written to `mailbox_access_log`.

**Isolation proof (run as leader Yorou Barkissou, role `authenticated`)**: own mailbox returned; direct SELECT on `position_mailboxes`, `mailbox_access_log`, `position_mailboxes_import` denied; `mailbox_key`, `mailbox_import`, `mailbox_checksum`, `leader_gate_state(other id)` denied; every `hq_*` RPC raises "HQ only" or returns empty; Vault schema not usable. There is no route in the app or the database that takes another leader's id.

**Leader dashboard**: "My WODDI mailbox" card (`js/components/mailboxcard.js`) on every seated leader's home, including while she is still gated by onboarding (shown locked with the exact step that opens it). Open: address + copy, masked password + Show/Hide + copy, Open webmail, note that reveals are recorded. Hidden when HQ is viewing a leader's dashboard read-only.

**HQ page `#/hq/mailboxes`** (sidebars: Founder, HOFCO, Secretary, Admin, IT): totals, gate rule and switch, seats parked at HQ, by level, by country (click to filter), register with search / country / level / access filters, CSV export, import instructions.

**Needs HQ (cannot be fixed in code)**
- 15 Country Representative / Deputy seats sit on the WODDI HQ unit instead of their country (list on `#/hq/mailboxes`, "Seats parked at the WODDI HQ unit"). Their mailboxes cannot be matched until each is re-seated on the right country unit.
- 47 WDOS state units differ structurally from the workbook (Burkina Faso, Côte d'Ivoire, Morocco's two Western Sahara regions, Gambia's Central River split, Madagascar's Vatovavy / Fitovinany split, and others). Each needs an HQ decision (rename in WDOS, or add an alias).
- Data repairs made during the audit: duplicate Lagos unit merged; Chad Hinberka's stale deputy seat closed; Blessing Vinyoh's wrong Akwa Ibom State Coordinator seat closed (HQ to seat her in Cameroon).

## 4. API hardening (migration 163)
While proving isolation, the advisor showed 14 internal / scheduled SECURITY DEFINER functions with the default PUBLIC execute grant. Anyone holding the site's anon key could have called `send_email()`, `candidate_notify()` (send any candidate any message), `ensure_org_unit()` (create units) and the sweeps through `/rest/v1/rpc`. These are now revoked from anon and authenticated (cron and internal callers run as postgres and are unaffected). Every `hq_*` function now refuses anon at the grant level as well as inside; trigger functions are not API-callable; the v84.4 helpers have a fixed `search_path`. Verified afterwards: HQ RPCs, leader RPCs, the join form path and all five cron jobs still run.

## 5. Files
- `supabase/migrations/161_activation_analytics_accuracy.sql`, `161b_activation_stats_register.sql`, `162_position_mailboxes.sql`, `162b_position_mailboxes_live_patches.sql`, `163_api_surface_hardening.sql` (all applied live; record only).
- `app/js/pages/hqactivation.js` (rewritten), `app/js/pages/hqmailboxes.js` (new), `app/js/components/mailboxcard.js` (new), `app/js/pages/home.js`, `app/js/pages/join.js`, `app/js/core/db.js` (wrappers, schema 163, v84.4), `app/js/app.js` (route), `app/sw.js` (precache, version), `app/assets/hq-sidebars.json`, `app/assets/css/wdos.css`, `app/locales/en.json` + `fr.json` (about 190 new keys each), `app/index.html` (badge).
- `position_mailboxes_import.csv` (17.2 MB) for the one-step import.

## 6. Not done, said plainly
- The LGA and ward mailboxes (139,444) are not in the database until the CSV import above is done from the browser; the code path is live and tested with the national + state rows.
- `citep75917@hideam.com` (okeke veps) uses a disposable-mail domain; it is left as a real registration because I cannot be sure. Mark it as test from its record if it is one.
- The 7-Day (open) route has no registrations yet; its page renders from the same code and was tested with empty data.
