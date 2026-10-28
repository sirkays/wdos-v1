# WDOS HANDOFF (living document) - regenerated 17 Sep 2026 (v82.3), state updated 3 Oct 2026 (v85.8)

How to use: at the start of any new chat, upload THIS file and the newest
WDOS zip named below. The new chat then has the complete state, not a
summary. Ask for a fresh copy of this file at every milestone ("update the
handoff") so it never goes stale.

## 1. Who and what

- Azeez Olayinka, IT Lead at WODDI (pan-African women's non-profit, HQ
  Nigeria, est. 2008; networks WGMN = Good Mother Network, ages 30+, and
  WNNN = Nurture NextGen Network, ages 18-29). Founder addressed as "Her
  Excellency" (H.E.) in documents.
- WDOS = WODDI Digital Operating System, the organisation's platform.
  Live at woddicrm.org (Netlify sites woddicrm.netlify.app and
  woddiwdos.netlify.app, both must be deployed every time).
- Stack (mandated): HTML5/CSS3/vanilla JS ES modules, NO frameworks, no
  build tools. Supabase (Postgres, Auth, RLS, Edge Functions, Realtime,
  Storage). Netlify hosting. Brevo email (~300/day free cap). Brand:
  magenta #D4006A, lemon #7CB518, motto "No Woman Is Left Out".
- The WODDI Institute app is a SEPARATE Supabase project. Never mix them.

## 2. Current live state (as of this handoff)

- App: v85.8 expected on woddicrm.org (badge "build v85.8"; db 172). v85.7 went
  live 09:39 3 Oct (confirmed by Azeez's screenshot).
  v85.8 = Phase 222 bug sweep (docs/PHASE222-BUG-SWEEP.md). Migration 172
  (LIVE): field_members view gained country/hq_function/state_region/lga/
  role_applied/is_leader (#/members was broken: column does not exist);
  central_admin patched in place (DO block with replace(), each fragment
  must match once): vacant_country = CR/DCR vacant in every country with a
  unit (= attention + Structure, 16), reports_due = units with a seated
  leader (= reporting.expected, 59), members_other, activation figures from
  candidate_activations (ref3/open7, is_test excluded) not the retired
  activation_journeys; journey_autostart is a no-op. App: Command Centre
  tiles (one row of 9, "Leaders in seats" + active 30d), strip adds "with
  no network", aligned funnel grid (also networkhq), "Figures as of"
  generated_at; Network Command NaN ratio; HOFCO activity template label;
  fmtDate reads YYYY-MM-DD as a local day. RULE: the connector also refuses
  DELETE without owner confirmation (pending: Abubaida's stray 14-day
  journey d0753481-...). Sweep tools: scratchpad render/rpcscan.mjs (calls +
  params + columns -> checked in SQL), render/sweep.mjs (every page, flags
  raw keys/NaN/undefined; fixtures captured live as a user via
  set_config('request.jwt.claims', ...) and pg_temp.tj() trimming).
  v85.6 = v85.5 minus app/netlify.toml: Netlify Drop now BUILDS dropped
  folders; that file ([build] publish="app") made the drop fail at
  "Initializing". RULE: no netlify.toml/package.json inside app/.
  v85.7 = config.json renamed wdos-config.json (Netlify Drop detected
  a root config.json as Hugo -> "hugo" build exit 2). _redirects rewrites
  /config.json for old builds. GATE: run @netlify/build-info detect on
  app/ before shipping; it must report no framework.
  v85.5 = Phase 220 (docs/PHASE220-INCOMPLETE-UPLOAD-SAFETY.md): the v85.4
  upload held only the 23 update-pack files (supabase.js, i18n.js... 404).
  SW install now aborts on ANY 404 (keeps the working version); guardian
  probes start-up files (?__probe= bypasses SW) and shows "missing files" /
  "no connection" screens instead of clearing caches. DEPLOY MODEL
  CHANGED: ship wdos-vX-app.zip = COMPLETE app minus the unused
  content/founder-message.mp4 (6 MB); no partial update packs any more
  (v85.3?/v85.4/v85.5 uploads were pack-only and took the site down).
  v85.4 = Phase 219 (docs/PHASE219-ENDLESS-SPINNER-AFTER-DEPLOY.md): SW
  install stored a MIXED build (stale copies on plain URLs between browser
  and Netlify right after a deploy) -> module export error -> endless
  spinner, served forever by cache-first. Now: install fetches ?__b=VERSION,
  verifies index.html BUILD_MARK + db.js APP_VERSION, all-or-nothing;
  misses also ?__b; guardian.js auto-repairs (clear SW+caches, reload once
  per 2 min) on module errors / 20 s no paint. RULE: bump APP_VERSION in
  BOTH sw.js and db.js and the badge in index.html, or the install refuses.
  v85.3 = Phase 218 (docs/PHASE218-PROFILE-WIPES-AND-14DAY-EXPORT.md):
  profile forms wiped country/state/role/LGA (PROFILE_COLUMNS lacked them
  before v78.0, lga until now; Save sent every box). Forms now diff-save
  (saveMyProfileChanges), keep non-list values; trigger profiles_keep_filled
  (170) blocks self-blanking. 67 values / 32 people restored from audit_log.
  14-Day passed list: activation_passed_export() (171, HQ) + passedexport.js
  PDF/CSV/XLSX on #/hq/activation tab "14-Day Activation" and #/reports.
  RULE: the Supabase connector cancels any statement containing DROP; use
  create or replace (trigger/function) instead.
  v85.2 = Phase 217 (docs/PHASE217-ACTIVATION-DAY3.md): "remove the Day 3
  gate" = save_activation_day never marked the LAST day completed (ref3 D3,
  open7 D7), so activation.js showed Day 3 forever and never the assessment.
  169 LIVE fixes the function + repaired stuck candidates (readiness row
  exists). activation.js treats has_assessment day as done when assessment
  exists. Live site was v85.0 at 16:32 (v85.1 not yet deployed).
  v85.1 = Phase 216 AUDIT (docs/PHASE216-AUDIT-REGISTER.md): 166 LIVE locks
  29 unguarded SECURITY DEFINER fns (22 internal: no anon/authenticated; 7
  app-only: no anon). 167 LIVE dashboard cache cron */10 + 10-min freshness.
  168 LIVE blank country/state -> NULL. App: getSession() returns the stored
  session only while its JWT is unexpired (v84.7 loop fix); router loop
  breaker (>10 resolves/4 s -> stop card); View as fixed (no
  avatar_updated_at; viewed leader unit_id to country_dashboard);
  plainerror.js for DB refusals; 68 fr strings translated. Open decisions:
  Kaltume Vogadika seat on unused account; 15 HQ-parked seats; 194 unseated
  "leaders"; duplicate accounts. Gaps D1-D7 in the register.
  v85.0 = Phase 215 (docs/PHASE215-CANDIDATE-SIGNIN-LOOP.md): candidates
  looped sign-in -> sign-out: #/candidate and #/join sign out on purpose,
  v84.7 remembered them as returnTo and sent people to #/login. Now
  router isPublicHash(); public pages never remembered, sign-out on a
  public page moves nobody. Deploy via wdos-v85.0-update.zip (files changed
  since v84.6; the full zip is the record).
  v84.9 = Phase 214 (docs/PHASE214-LEADER-ISSUES-ONBOARDING-GOOGLE.md):
  onboarding VISIT steps (2 reporting_line #/my/network, 9 templates
  #/reporting, 10 plan #/my/templates) never completed: "opened" lived in
  page memory and #/my/network was refused by the gate. js/core/obvisit.js:
  record in localStorage wdos.ob.visit on "Open the page", gates allow that
  page (allowedByVisit), onPageShown() completes the step after 3 s + bar.
  Google sign-in broken since v66.6 (redirectTo <origin>/#/ -> landing
  #/#access_token, unreadable): redirectTo is bare origin again, boot()
  repairs double-# landings, router shows oauth=failed when tokens fail.
  165 APPLIED LIVE: Burundi CR surname Orly Umuvyeyi (5 places).
  v84.8 = Phase 213 (docs/PHASE213-ADMIN-FUNCTION-CHECK.md): Accounts banner
  "admin-users not deployed or not reachable" was a single lost answer (the
  function answered 200 in the logs) that then locked every auth button.
  Now invokeFn() retries safe actions (ping/set_password/set_email/ban) on
  FunctionsFetchError; errors carry code unreachable/not_deployed/hq_only/
  not_signed_in; only a real 404 blocks buttons; banner has Check again.
  admin-users v6 LIVE (CORS Max-Age 86400 + wider allow-headers; logic same).
  v84.7 = Phase 212 (docs/PHASE212-SESSIONS-CLOCK-AND-TABS.md): sign-in and
  session fixes. Cause of "Sign in does nothing / kicked to login": a device
  clock 1h fast made every token look expired -> refresh storm -> Supabase 429
  -> library deleted the session. Now: clock difference measured from each new
  token's iat and expiry shown to the library in device time (wdos.clock);
  one stored token per sign-in shared by its windows (localStorage
  wdos.auth.s.<session_id>, window pointer sessionStorage wdos.auth.slot,
  wdos.auth.latest for new windows); 429/storm -> 30 s pause as retryable
  (session kept); getSession() never throws; Phase 170 backup/recover
  REMOVED. Router: navigation sequence + fresh outlet per page + Try again
  card; navigate() redraws same hash; sign-in returns to the page you were on
  (sessionStorage wdos.returnTo). Context (profile/hq/hqFn/modules/candidate/
  gated) loaded in one parallel round, cached per window 30 min
  (wdos.ctx.v1) and revalidated in background. Test harness:
  scratchpad render/authsim.mjs + scen.mjs (mock GoTrue with rotation,
  reuse detection, 429, latency, fake clock).
  v84.6 = HOTFIX: v84.5 overwrote js/components/charts.js (donut/bars/line,
  used by reports.js which app.js imports at boot) -> whole app stuck on the
  spinner. Original restored; ops charts moved to opscharts.js; guardian.js
  rescue screen now fires when only the boot spinner shows. RULE: before
  creating a file, check the name does not exist; run the import checker.
  v84.5 = Phase 211 (docs/PHASE211-OPERATIONS-CENTRE.md): 164 APPLIED LIVE.
  Operations Centre #/ops for HOFCO (Regina, regina@thewoddi.org): every
  volunteer leader's activity + score, message one/some/all (in-app, push,
  optional email) with read tracking, assign tasks to leaders, structured
  PDF reports (WDOS operations, 3-Day, 7-Day; html2pdf vendored), Autopilot
  rules (all OFF by default; cron wdos_ops_autopilot 06:05 UTC). Inter
  variable + Font Awesome 7 self-hosted; icon() now renders FA; HQ sidebar
  icons per route. Regina has 3 accounts (flagged, untouched).
  v84.4 = Phase 210 (docs/PHASE210-ACTIVATION-ANALYTICS-AND-MAILBOXES.md):
  161/161b/162/162b/163 APPLIED LIVE via connector. Activation analytics
  rebuilt in the database (hq_activation_stats / _register / _candidate:
  real "started", people vs registrations, duplicates, email typos, test
  records, mailer answers reconciled by cron); HQ page rewritten on it.
  Position mailboxes: 1,750 national+state loaded and verified, encrypted
  with a Vault key; LGA/ward (139,444) load by dashboard CSV import into
  position_mailboxes_import (see the phase note); leader card "My WODDI
  mailbox" gated by activation or Leadership Pack onboarding
  (my_position_mailbox, auth.uid only); HQ page #/hq/mailboxes.
  API hardening: 14 internal functions (send_email, candidate_notify,
  ensure_org_unit, sweeps...) no longer callable by anon/authenticated.
  Pending HQ: 15 CR/DCR seats parked on the HQ unit; 47 state units that
  differ from the workbook; Blessing Vinyoh to be seated in Cameroon.
  v84.3 = Phase 209: candidate emails LIVE via send_email/Brevo
  (candidate_messages, candidate_notify, triggers, 6-hourly reminder
  sweep, candidate_comms_log, hq_candidate_comms); referral source on
  the form; Existing-users block removed from the activation page.
  v84.2 = Phase 208 (docs/PHASE208-SCALABILITY-HQ-ROUTES.md): 158/159
  APPLIED LIVE via connector (ancestors array, scope-once policies,
  dashboard cache + cron, completed-means-assessed); HQ page split by
  route; register line fixed. App only to deploy.
  NOTE: the Supabase connector on this Claude account now reaches the
  WDOS project (vhudbuprjpsyizporkcn); DB changes can be applied directly.
  v84.1 = Phase 207: #/candidate sign-in page; #/join/WODDI -> chooser;
  automatic assessment + recommendation (activation_auto_assess, weights
  in activation_settings, tie rule); hq_appoint_candidate one-click human
  approval (seat, is_leader, activated, others -> reserve). Migration 157.
  v84.0 = Phase 206: activation screen without the details block or the
  open-in-tab button; manual no longer says fourteen days. App only.
  v83.9 = Phase 205: join form no longer calls auth.getUser() after
  sign-in (auth-lock deadlock -> "Signing you in..." forever); 90 s hard
  stop with "Continue to my activation". App only.
  v83.8 = Phase 204: position_place() — place shown follows the position
  level (CR = country, SC = state, LGA = lga, cluster/chapter = cluster);
  ranking groups by that level; master register sends position_code/
  position_place.
  v83.7 = Phase 203: candidate-only sidebar in vshell (candidate flag);
  literal "null" removed; my_activation returns last_name/place (155);
  docs/WDOS-ROLE-BASED-ACCESS.md written.
  v83.6 = Phase 202: ROOT CAUSE of "No activation": profiles_guard (001)
  refused network/org_unit changes on own profile -> every begin failed
  silently. Guard honours a wdos.system transaction flag set by
  activation_begin_for; activation_errors log + HQ view; failures shown
  on screen; 154 backfills. Migration 154 REQUIRED.
  v83.5 = Phase 201: activation created AT SIGN-UP by a profiles trigger
  (activation_begin_for, referral form in auth metadata); gate keyed on
  my_candidate_state (no seat + applicant/referral/unselected activation);
  activation page self-heals from profile.referral_code; 153 backfills
  missing activations and prints Nigeria/HQ country seats.
  v83.4 = Phase 200: join form signs out any existing session first and
  verifies the signed-in email; activation page offers both forms when
  none exists; coordinator lookup ignores HQ-level seats (152 lists seats
  parked at HQ); preferred-language dropdown, password eye, dark mode on
  the form and volunteer shell.
  v83.3 = Phase 199 (docs/PHASE199-TWO-REFERRAL-FORMS-READINESS.md): TWO
  referral forms #/join/WGMN and #/join/WNNN (network from the link, WODDI
  paused); no age rule; blob: preview CSP fix + client-side resize;
  sign-up with per-step timeouts and pending recovery; hq_referral_forms;
  hq_user_readiness block. Emails still NOT wired. Migration 151 REQUIRED.
  v83.2 = Phase 198 (docs/PHASE198-REVISED-ASSESSMENT-RANKING-AUDIT.md):
  hq_activation_master read-only bug fixed; WGMN/WNNN buttons on the join
  form (network_chosen, age check); Founder's wording; language chips;
  REVISED 30-statement assessment as an 11-step stepper (readiness_form,
  submit_readiness_v2, review_readiness_v2); ranking per seat
  (hq_activation_ranking, rank_score /100); 26 missing locale keys added;
  full static audit. Migration 150 REQUIRED.
  v83.1 = Phase 197: CR/DCR in the join position list; migration 149
  seeds level-2 for all African countries (774) + level-3 for 13 (~900).
  v83.0 = Phase 196 (docs/PHASE196-SINGLE-LINK-FORM-7DAY.md): ONE referral
  link #/join/WODDI; form captures position + Country/State/LGA/Community
  Cluster with per-country level names (country_level_names, 54 seeded);
  14-Day -> 7-Day; HQ master page rebuilt (hq_activation_master): link
  stats, totals, by position/country/state/day, candidate register with
  form details + day activities + answers, CSV. Migration 148 REQUIRED.
  v82.8 = Phase 195: join form header — WODDI wordmark + language select,
  network logo (WGMN wordmark / WNNN disc). App only.
  v82.7 = Phase 194: join form fixed ({role}/{place} filled, real name
  labels, phone REQUIRED + validated, photo REQUIRED with preview and
  uploaded to her avatar); candidates gated to #/activation (no modules,
  no leader menus) until completed AND selected. App only.
  v82.6 = Phase 193: per-link tracking (hq_link_tracking, referral_link_set;
  migration 147) on the HQ Activation page and My Referrals.
  v82.5 = #/hq/activation and #/activation endless spinner (routes were
  registered as bare functions; authed() needs a module with .render) —
  fixed, both pages now mount inside their shells; 3-Day button on the
  Command Centre action row and HOFCO quick actions.
  v82.4 = Activation & Readiness added to the HQ function sidebars
  (assets/hq-sidebars.json: founder, hofco, secretary, admin, qa).
  v82.3 = Phase 192 (docs/PHASE192-3DAY-REFERRAL-ACTIVATION.md): 3-Day
  referral activation + 7-Day open-call route from the FINAL content
  pack; #/join/CODE link opens signup directly (network/position/place
  preset, age check); #/activation candidate journey with auto-save,
  acks, questions, 13-q readiness assessment, extensions; #/hq/activation
  analytics (funnel, by day/network/country/referrer, candidate list,
  review/return/outcome, link creator); cards on Command Centre + HOFCO;
  leaders create links from My Referrals. Migration 146 REQUIRED.
  v82.2 = Phase 191: reload loop — sw activate no longer navigates
  windows (posts wdos:new-build; page reloads ONCE per build via
  sessionStorage guard); reg.update() on tab focus removed; #/me/:tab
  redirected. App only.
  v82.1 = Phase 190: designation now names the seat ("State Secretary,
  Imo State"); 36 monthly SVGs had a raw "&" (Years 3-5) and did not
  render — fixed; monthly cycle anchored to Month 1 = September 2026
  (migration 145) instead of wrapping to Month 60.
  v82.0 = Phase 189: state_secretary role (143 enum alone, then 144 seat +
  titles + inserts) and the first account, Chukwuemeka Okwah, WGMN Imo,
  created by SQL with a temp password inside 144.
  v81.9 = Phase 188 (docs/PHASE188-MONTHLY-AND-FOUNDER-WELCOME.md): all 60
  months of the Monthly Leadership Inspiration + 20 role lenses (first
  Wednesday, whole month, role lens from the ACTIVE seat, one push per
  person); Founder's Welcome shown once per APPOINTMENT (14 records,
  is_active=false until the Founder approves the wording). 60 monthly
  graphics. Old engagement_content monthly rows deleted.
  v81.8 = Phase 187 (docs/PHASE187-MONDAY-ONLY-FRENCH.md): weekly card is
  MONDAY-ONLY on the dashboard (My Messages passes p_any_day and shows it
  every day); French content for all 13 weeks both networks + the 20 role
  ACT inserts; hq_message_inserts gains language; resolution = her locale
  then English. pt/ar/sw not written (data job).
  v81.7 = Phase 186 (docs/PHASE186-HQ-MESSAGING-ENGINE.md): WODDI HQ
  Messaging Engine per the Founder's framework — hq_messages /
  hq_message_inserts / hq_message_delivery, my_hq_message() Monday
  release with {{FirstName}} {{RoleTitle}} {{LocationName}} + the exact
  role ACT insert, archive, hq_message_stats(); old weekly library
  DELETED and replaced with weeks 1-13 of the Five Year Master (26
  messages, 260 inserts) + 26 graphics. NOT built: HQ authoring UI,
  message translations, per-recipient time-zone release, weeks 14-260.
  v81.6 = Phase 185 (docs/PHASE185-MESSAGES-AND-RETIRING-ME.md): bodies
  written for all 52 weekly + 12 monthly messages (migration 139); every
  message printed in full on the dashboard (no "All my messages", no links
  to #/me); #/me RETIRED and redirected, new sidebar entries My Messages
  (#/my/messages) and Inspiration Library; welcome quote panel removed.
  Still only on me.js: date-of-birth field + notification switches.
  v81.5 = HQ message card was gated behind onboarding completion (gated
  branch returns early) so leaders mid-onboarding saw none; now shown to
  everyone. Gate/checklist copy updated from the checkbox era.
  v81.4 = content/leadership-manual.html rewritten (it was a PDF dump:
  8 huge paragraphs, 3 flattened tables) - sections, sub-headings, lists,
  5 real tables; reader typography extended to match.
  v81.3 = onboarding document was blank (iframe blocked by frame-src with
  no 'self'); the reader now fetches and renders the document inline,
  exact scroll tracking, content precached, CSP frame-src 'self' added.
  v81.2 = Phase 184 (docs/PHASE184-GUIDED-ONBOARDING.md): onboarding is
  now a one-step-at-a-time reader (js/pages/onboarding.js) - document
  embedded, Next unlocks only after scrolling to the end + a minimum
  dwell, evidence (seconds_spent / reached_end) stored and ENFORCED by
  complete_onboarding_step; gate lifts only when every required step is
  done (was: the single "pack" tick). Migration 138 REQUIRED.
  v81.1 = Phase 183 (docs/PHASE183-HQ-MESSAGE-STREAM.md): weekly /
  monthly / birthday message on the volunteer dashboard, ONE at a time
  (birthday > monthly on days 1-3 > weekly), artwork by tone from
  engagement_content.tone (6 SVGs in assets/messages/), personalised by
  first name and signed WODDI HQ, birthday filed by my_message_stream
  itself so it no longer depends on the daily job; birthday_watch() for
  HQ. Migration 137 REQUIRED.
  v81.0 = Phase 182 (docs/PHASE182-LANGUAGE-STICKS.md): header language
  choice now wins over profiles.preferred_locale (route hook applied the
  account default on every navigation → Benin DCR stuck in French). App only.
  v80.9 = Phase 181 (docs/PHASE181-RESET-LIST.md): temporary passwords
  STRICTLY for the HQ master lists — assets/reset-list.json (104 people:
  32 Africa CR/DCR with the 17 red rows excluded, 72 Nigeria SC/ASC; Imo
  SC and ASC have no email), admin-users action bulk_reset_list (by email,
  never creates), Command Centre button replaced. Edge Function redeploy.
  v80.8 = Phase 180 (docs/PHASE180-HEADSHOTS-LOGINS-SESSION-SPEED.md):
  61 HQ headshots bundled in assets/leaders/ (47/50 WDOS names linked,
  Drive only as fallback); admin-users bulk_reset_directory + Command
  Centre "Temporary passwords for seated leaders (reset)" (Edge Function
  must be redeployed from the Dashboard); one session per browser window
  (tabStorage: sessionStorage live, localStorage seed; REPLACED in v84.7 by
  per-sign-in slots, see Phase 212) — ends the
  sign-in-elsewhere sign-outs; service worker precaches all 157 app
  files and serves cache-first (was network-first for everything).
  v80.7 = network hero first tile "NaN" fixed (heroTile Number()-ed the
  "x / 54" text). Logos + Drive avatars confirmed rendering on v80.6.
  v80.6 = Phase 179 (docs/PHASE179-DRIVE-PHOTOS-ATTENTION.md): network
  hero band was rendering at the FOOT of #/network/:net (appended after
  body) — now above; Drive profile pictures by name (driveAvatarByName)
  on attention items (network pages, HQ role homes, HOFCO owner column).
  v80.5 = Phase 178 (docs/PHASE178-NETWORK-LOGOS.md): official WGMN and
  WNNN logos (assets/logos/wgmn.png, wnnn.png, circular) on the
  #/network/:net hero bands and the HOFCO hero panels.
  v80.4 = Phase 177b (docs/PHASE177-HOFCO-ALIGNMENT.md): the same
  alignment rules on every dashboard — rows stretch and cards in a row
  share one bottom edge; .ca-table nowrap; wide tables on full-width rows
  (Command Centre country table); HQ role homes, WGMN/WNNN pages,
  Country Rep home (structure column 2:3, table scrolls in-card),
  Engagement. Attention required everywhere = 6 rows + count pill +
  "View all N". Chapter home unchanged (single column by design).
  v80.3 = Phase 177 (docs/PHASE177-HOFCO-ALIGNMENT.md): HOFCO screen
  re-rowed — Attention required full width (6 rows, count pill, "View all
  N"), work queue | quick actions, networks | region chart, country table
  full width (12 rows, no cell wrapping), status map | recent activity;
  new .ca-grid--eq keeps paired cards the same height. App only.
  v80.2 = Phase 176 (docs/PHASE176-EMPTY-SPACE-NOTE-PERFORMANCE.md):
  .ca-grid/.vs-grid align-items:start (empty space under shorter cards);
  network_snapshot() (136) + client-side 45s cache (db.js cachedRpc) +
  parallel fetch in hofco.js/central.js/networkhq.js/rolehome.js — cut
  the HOFCO screen from 3 full central_admin() calls to 1 full + 2 cheap.
  If HQ sign-in/navigation is still slow after this, check Supabase's
  own Query Performance / Logs panel next.
  v80.1 = Phase 175 (docs/PHASE175-INTERPRETER-KILL-SWITCH.md): HQ
  interpreter kill switch (Settings, org_settings.interpreter_enabled,
  no new migration). Off = plain Jitsi call, Tap to speak disabled
  (toggleSpeak() itself refuses, not just the DOM), "I want to hear"
  hidden, a plain banner shown; nobody's mic is touched by WDOS.
  v80.0 = (134 corrected: task_batch_summary "column reference status is ambiguous" — tasks.status vs profiles.status, now t.status/t.due_on throughout) Phase 174 (docs/PHASE174-COUNTRY-TASKS-FUNNEL-BIRTHDAY.md):
  country.js rebuilt (compact table, no filler charts); central_admin
  funnel network-filter bug fixed (133); Tasks & Follow-Up bulk
  assignment + completion requirements + evidence gate + Follow-Up
  Tracker + reminder sweep (134, tasks.js); registration birth_date
  (135). Tasks bulk/Follow-Up UI not yet covered by the render harness
  — test live after deploy.
  v79.0 = Phase 173 (docs/PHASE173-HOFCO-FIXES.md): black-panel cause
  (force-cache + unguarded SVG injection of a 404→index.html fallback)
  fixed in central.js/hofco.js/networkhq.js; removed the two 60-120s
  full-render setInterval loops (the "keeps reloading" report); Quick
  Actions moved beside Attention Required/Work Queue, coloured; region
  chart gained an Africa-overall bar + % labels; header photo added;
  new #/network/:net dedicated WGMN/WNNN pages.
  v78.1 = migration 132: hofco_dashboard support_unresolved query used
  tk.profile_id; tickets' submitter column is requester_id. RULE:
  sqlcheck/namecheck do not catch wrong column names on real tables
  (only functions/enums); verify against the actual create table when
  referencing a table for the first time in a new function.
  v78.0 = Phase 171: View as an HQ person opens her HQ screen (HOFCO /
  role home / Command Centre by hq_function_of(), migration 131) with a
  read-only banner; PROFILE_COLUMNS now carries hq_function (the sign-in
  bundle previously omitted it, so the HQ home fell back to the RPC
  default), plus country/state/role_applied/is_leader.
  v77.2 = Accounts row: HQ function button spread (no literal "null" on rows without HQ role).
  v77.1 = Phase 170 auto sign-out defence (REMOVED in v84.7, Phase 212): backupSession() on every
  SIGNED_IN/TOKEN_REFRESHED (localStorage wdos.session.backup, 12 h),
  recoverSession() via auth.setSession() when a SIGNED_OUT the user did
  not click arrives (authLog session_recovered / auto_signed_out with
  recover reason); signOut() clears the backup; SW activate reloads all
  open windows so no stale build keeps a client alive. If recovery fails
  with "revoked"/"invalid refresh token", the server ended the session:
  check Auth → Sessions (single session per user, time-box, inactivity).
  v77.0 = Phase 169 (docs/PHASE169-HOFCO-PICTURE-APPENDIX.md): HOFCO
  network hero panels + mini maps, coverage by AU region, status map;
  My Delegated Portfolio for deputies/assistants; engagement items on
  leaders' calendars with participation.
  v76.0 = Phases 167-168 (docs/PHASE167-168-ALL-TRACKS.md): role
  homepages (rolehome.js), decision letters (129: templates +
  decision_letter() + decide_application redefined), engagement engine
  (130: engagement_items/participation/followups, engagement_status,
  engagement_overview, page #/engagement).
  v75.0 = Phase 166 (docs/PHASE166-APPROVED-SCREENS.md): leader/member
  home = approved Screens 2 (countryHome) and 3 (chapterHome) in
  home.js; core/titles.js network role titles. Figma file
  GYJAY4VYGE8qFc5RftkDHe holds the approved designs.
  v74.0 = Phase 165 (docs/PHASE165-ROLE-SIDEBARS-HOFCO.md): hq_function
  + my_hq_function() + hofco_dashboard() (128); role sidebars
  (assets/hq-sidebars.json, nine roles); pages/hofco.js Reference
  Screen 1; pages/planned.js for scheduled modules; HQ home by role.
  v73.0 = Phase 164 (docs/PHASE164-RECOMMENDED-SIDEBAR.md): HQ sidebar
  = recommended 12 sections (collapsible, layout.js NAV groups); leader
  profile locked (no photo change / edits; HQ maintains via Accounts).
  v72.9 = Phase 163: pictures straight from the HQ Drive folder.
  assets/leader-photos.json maps 50 listed leaders → Drive file ids
  (built from the folder listing); core/photos.js drivePhotoFor() /
  withDriveFallback(): WDOS avatar → Drive thumbnail
  (drive.google.com/thumbnail?id=…&sz=w320) → initials. Used on the
  leader dashboard, header, Accounts rows (directory rows too) and the
  country page. REQUIRES the Drive folder shared "Anyone with the link:
  Viewer". netlify.toml CSP img-src adds drive.google.com and
  *.googleusercontent.com (only matters if the toml is ever deployed).
  Not covered: Umutoni and Coulibaly (HEIC, Drive thumbnails may still
  render), Katsina (PDF).
  v72.8 = Phase 162 Accounts → "Import photos": folder drop, file-name
  matching (stop words for roles/states/countries, prefix + Levenshtein
  ≤2), review/correct table, canvas resize to 640px JPEG, upload to
  avatars (login) or pending-photos (no login yet). Drive folder
  1-sirNUiiHKroSwiWB6Tiv1avhS3VJZJ0 (+ "DCR Photos", "State Coordinator
  Headshots"): 49 usable images, 44 auto-match, 5 need the dropdown;
  HEIC (Umutoni, Coulibaly) and the Katsina PDF need converting first.
  v72.7 = Phase 161: Command Centre shows Recruitment funnel (online:
  received → 7-Day activation → review → appointment pending →
  appointed) with the Referral funnel beneath (referral → contacted →
  3-Day activation → review → appointment pending → appointed); referred
  = referral_code on application/profile or referrals table; page
  refreshes every 60 s while visible. Activation still counts the
  14-day journey until 7-day/3-day content exists.
  v72.6 = Phase 160: admin-users action bulk_create_directory (server-
  side loop: create login, link directory, seat via directory_seat_target
  running AS THE CALLER because hq_set_role/hq_link_directory are
  is_case_hq-guarded, backdate) → Command Centre button "Create logins
  for all listed leaders (one step)" opens the grouped sheet. Reason:
  seat_from_lists on 9 Sep seated only 5, the rest had no profile
  because the browser-driven login loops died with the HQ session.
  REDEPLOY admin-users.
  v72.5 = migration 126 runs seat_from_lists() inside the file (editor
  shows the JSON summary), ends seats of on_hold (red) names and clears
  their is_leader. Expected after run, from the lists as given: 13
  countries with CR+DCR seated, 7 with one of the two, Ghana CR and Imo
  SC unseatable (no email → no login).
  v72.4 = migration 125: country_dashboard "column reference id is
  ambiguous" — org_unit_subtree() returns setof uuid, so every
  `select id from org_unit_subtree(x)` must be aliased `as sub(id)`.
  RULE added to the harness (unaliased subtree check).
  v72.3 = migration 124: country_dashboard enum/text coalesce cast (the
  HQ country page errored "COALESCE types text and network_code cannot be
  matched"). Harness: enumcoalesce-check.py.
  v72.2 = Phase 157: Countries page rows open #/country/:id (HQ view of
  the country panel: CR/DCR, states with SC/ASC, responsiveness, reports,
  "View dashboard & KPIs" = #/view-as/:id); migration 123 retires the
  Banana Republic demo country; st.act_deferred label. REQUIRED once:
  Command Centre → "Seat leaders from the HQ lists" (or select
  seat_from_lists();) so the lists become seats.
  v72.1 = Phase 156: the Command Centre showed 6 countries / 94 leaders
  because leaders with older logins had no SEAT. seat_from_lists() (122)
  seats every CR/DCR/SC/ASC on the two HQ lists (creates missing country
  units under HQ; dated to the NG appointment date; skips on_hold), run
  from the Command Centre button "Seat leaders from the HQ lists" or the
  SQL editor (select seat_from_lists();). Coverage rule now: CR+DCR seated
  = represented; any seat = needs strengthening; none = not yet.
  Vacancies shown by level (CR/DCR, state, LGA-and-below).
  v72.0 = Phase 155 Central Admin (docs/PHASE155-CENTRAL-ADMIN.md):
  central_admin() bundle + africa_countries table (121), #/ for HQ =
  pages/central.js (old dashboard at #/dashboard), 22-item HQ sidebar,
  assets/africa-map.svg (54 ISO-tagged paths from @svg-maps/world),
  dead-link check covers both sidebars.
  v71.6 = Complete login sheet has a scope chooser (Nigeria SC/ASC,
  Africa CR/DCR, others; reset signed-in leaders yes/no).
  v71.5 = auth log adds storage_set_elsewhere / storage_removed_elsewhere
  (another window wrote/removed the session) and tab_visible. OPEN: HQ
  auto sign-out recurs (9:59, 11:23 on 9 Sep, single tab). Two
  candidates: Supabase "Single session per user" with the shared
  woddi.org@gmail.com account (fix = individual HQ logins), or refresh
  failure; the #/doctor Auth events box decides.
  v71.4 = Phase 153: Accounts "Complete login sheet: all volunteer
  leaders" (create missing, reset never-signed-in, optionally reset
  signed-in, seat unseated via directory_seat_target, list no-email rows)
  → one grouped sheet; migration 120: norm_state strips "State",
  seat fallback to the unique state unit by name.
  v71.3 = Phase 152: password sheet grouped (Nigeria SC/ASC by state,
  Africa CR/DCR by country, others); new Accounts button "Password
  sheet: leaders who never signed in" (set_password per leader with a
  login and no sign-in, not on hold) → same grouped sheet; leader
  Profile tab shows a "My login" card (email, ID, last sign-in, Change
  my password). A password can never be read back; only reissued.
  v71.2 = Phase 151 after the first bulk-login run (9 Sep, 11 created,
  ~50 "not_signed_in" because the HQ session died mid-loop; contact
  apply hit the 8 s API statement timeout with 508 accounts): appliers
  prefilter by email / first-name position before name_match and set a
  120 s timeout for their transaction; norm_country aliases; state derived
  from member code; leader_directory.on_hold for the founder's red names
  (bulk skips them; Rwanda CR/DCR already got logins on run 1: HQ may
  Suspend); sheet has a State column; loop stops cleanly if the session
  is lost; auth log records the signed-in email (who) per event.
  OPEN: cause of the HQ auto sign-out (9:59 and mid-loop) — read
  #/doctor Auth events; if "who" changes between events, a second tab
  signed in as another person in the same browser.
  v71.1 = Phase 150 (docs/PHASE150-NG-STATES-SIDEBAR.md): NG SC/ASC list
  (118), norm_state, seat backdating, sidebar = founder document 17 x
  sub-sections with collapsible groups + module fallbacks +
  harness/deadlink-check.mjs (0 dead), chime at gain 1.0, /wgmn path
  handled in app.js + app/_redirects, "Phone number" label.
  v71.0 = Phase 149 (docs/PHASE149-COUNTRY-CONTACTS-LOGINS.md): contact
  list staging + register_contacts_apply(), directory_seat_target(),
  country_dashboard(); My Country page (#/my/country) with SVG charts,
  drill-down, Message links (#/messages?u=id); Accounts bulk "Create
  logins for all leaders without one" with a printable password sheet;
  header wordmark replaces the banner; login page language bar.
  v70.3 = Phase 148: v70.2 floors (0.02 RMS / 0.03 peak) rejected real
  speech on a laptop array mic. Now MIN_RMS 0.01, MIN_PEAK 0.015,
  MIN_SPEECH 450ms, all HQ-tunable (lane_min_rms, lane_min_peak); the
  grey line shows the live mic level, floor and clip peak while Speak is
  on, and a skipped clip states its numbers. Function gate loosened
  (no_speech<0.6, logprob>-1.4). RULE: never set a microphone threshold
  without the readout from the user's device.
  v70.2 = Phase 147 noise/hallucination guard (8 Sep video: an empty room
  with Speak on produced "Obrigado", "Thank you", an Italian sentence,
  each translated). Client: absolute RMS floor 0.02 (was noise*3 with
  0.008 floor), MIN_SPEECH_MS 600, a clip is sent only with a 0.03 peak;
  unsupported-language short transcripts and filler phrases skipped.
  Function: verbose_json segments dropped when no_speech_prob>=0.55,
  avg_logprob<=-1.1 or compression_ratio>=2.4; returns dropped count.
  REDEPLOY transcribe.
  v70.1 = Phase 146: no "I speak" picker. Bug 8 Sep: "My language" (hear)
  was also sent to Whisper as the spoken language, so English speech
  tagged French came back as French text and listeners heard it
  translated back. Now the transcribe function runs Whisper with no hint
  (verbose_json) and returns {text, language}; every caption carries the
  detected language; the only picker is "I want to hear". REDEPLOY the
  transcribe function (supabase/functions/transcribe/index.ts).
  v70.0 = Phase 145 (see docs/PHASE145-REGISTRATION-SIDEBAR-GATE.md):
  /wgmn and /wnnn doors, language bar, mandatory phone, country list +
  state + country languages (COUNTRY_LANGS), photo at registration
  (pending-photos bucket, adopted on first sign-in), profile enrichment
  trigger, read-only role, network banner, 17-section sidebar, pack gate
  (app.js route gate + home.js tab gate; event wdos:onboarding-changed).
  v69.1 = Phase 144 playback backlog policy (8 Sep phone log: voice queue
  0.3 → 6.5 → 9.4 s as the English voice read slower than the French
  speaker spoke): behind >1.5 s → voice at 1.2x with a grey notice;
  behind >4 s → that sentence is text-only (muted icon) with a red
  notice; normal voicing resumes when the queue clears. Rate plumbed to
  device voices and audio playback. harness/backlog-test.mjs: without
  policy worst wait 14 s and growing, with policy 4.5 s.
  v69.0 = Phase 143 sentence-flow fix ("interprets once, then stops until
  reload", 8 Sep): cutSegment()/startSegment() reset the shared had-speech
  flag before the old recorder's async stop event read it, so every clip
  cut at a pause after a real pause was dropped (harness/recorder-race.mjs
  reproduces: old 0 clips, new 1). Each recorder now owns its chunks and
  flag. Remote tts broadcasts hold the mic only when call_raw_voice is on
  (booth mode: the interpreter voice never reaches the mic through the
  call). Dropped clips are announced on the diagnostic line ("skip").
  v68.9 = translate lane fix (Phase 142). Evidence 8 Sep: translate
  function 57% 5xx, 19 x 502 in 24h; phones (no device translator) fell
  to passthrough after 14s. Function now tries models in order
  (llama-3.1-8b-instant, llama-3.3-70b-versatile, openai/gpt-oss-20b,
  gemma2-9b-it), retries once on 429/503, logs Groq's reason
  (console.error → Logs tab) and returns {text, model, ms}; the app
  carries the 502 reason into status.translateTrace. REDEPLOY translate.
  v68.8 = translation lane trace: each lane (device / cloud / ai / free)
  records ok-or-error and ms (status.translateTrace); the fallback line
  and the timing log show it. Lanes now time out (cloud/ai 8s, free 6s).
  OPEN 8 Sep: on an Android phone (no device translator) en→pt took 14s
  then passthrough: the cloud translate function or its key is failing
  for phones; the trace will name the lane.
  v68.7 = transcribe keep-warm starts on room open (was on Speak; the
  first clip still paid a 3.0s cold start on 8 Sep). Measured en→fr on
  v68.6 after warm-up: upload 0.5-0.6s, transcribe 0.15-0.19s, translate
  30-60ms, total 0.8-1.4s per sentence. Groq subscription irrelevant.
  v68.6 = Phase 140 lane speed-ups from the 8 Sep measurement (en→fr:
  first clip translate 3.0s = device translator warm-up; then 39-61ms;
  ears 1.5-2.3s; pause 700ms): translators warmed on hello/hello_ack
  (hello now carries speak/hear), transcribe function kept awake while
  Speak is on (GET ping every 4 min), pause 700→500ms and min speech
  400→350ms (org_settings lane_pause_ms / lane_min_speech_ms), the
  transcribe function returns groq_ms/fn_ms so the log splits ears into
  upload + transcribe. REDEPLOY the transcribe Edge Function (paste
  supabase/functions/transcribe/index.ts) for the split to appear.
  v68.5 = Phase 139 room pickers: one "My language" (hear = speak) with
  an "I speak a different language" toggle revealing the speak picker
  (wdos.room.split); timing lines carry from→to. Solo test now needs the
  toggle on. Open: a fr/fr solo clip on 8 Sep showed translate 4.6s,
  which is impossible when from = to; the next log names the languages.
  v68.4 = Phase 138 lane stopwatch: every interpreter clip records pause,
  ears (upload+transcribe), translate, voice queue, voice, total; grey
  diagnostic line shows the last clip and a p50/p95 summary; "Copy timing
  log" button copies the last 60 lines. Speaker stages travel in the cap
  payload (tm). Purpose: measure before spending on any subscription.
  v68.3 = migration 115: referral_overview no longer reads state_region/lga
  from applications (they carry org_unit_id only); location from the unit
  chain, position from the link. Check 9 added to the harness: every
  a.<col> reference in a migration must exist on that table.
  v68.2 = migration 114: register_reconcile/apply runnable from the SQL
  Editor (guard: no user OR HQ seat). Rule: any function meant to be run
  by IT in the editor must not use a bare is_case_hq() guard.
  v68.1 = Phase 137: WGMN Master Register (06 Sep) loaded as staging
  (leader_register), register_reconcile() name matching within country,
  register_apply() adds missing unflagged names to leader_directory;
  country flags as bundled SVGs (assets/flags) on welcome band, header,
  Accounts rows. See docs/PHASE137-REGISTER-RECONCILE-FLAGS.md.
  v68.0 = Phase 136 Referral Links (migration 112): referral_links,
  referral_visits, referral_code on applications/profiles, public #/r/CODE
  landing, HQ page #/reflinks, leader tab #/my/reflinks (link per vacant
  seat by position/location/network + membership link), doors stamp the
  stored code after submission. See docs/PHASE136-REFERRAL-LINKS.md.
  v67.4 = Phase 135b: appointment acceptance (leader accepts the
  Acceptance & Commitment Declaration or declines with a reason; seat
  becomes vacant on decline; existing seats marked accepted at start) and
  a tracked ten-step onboarding checklist (leader ticks; HQ sees done/total
  on Accounts with filters "Onboarding incomplete" and "Acceptance
  pending"). Migration 111 also redefines volunteer_home and
  hq_account_list so roles carry accepted_at/declined_at.
  docs/WDOS-Functional-Verification-Self-Assessment.pdf = honest 34-section
  PASS/PARTIAL/FAIL sheet against the Admin Secretary guide (17/15/2).
  v67.3 = migration 110: Accounts list cap applied to members with logins
  only, so directory leaders awaiting a login are always shown (the 103
  version hid them once members exceeded the cap); list cap 1000.
  docs/ADD-NGUNAN-ADDINGI.sql adds Hon. Addingi to the directory (CR-NGA,
  Nigeria, WGMN) so Create login is pre-filled.
  v67.2 = Azeez's 6 Sep list: migrations 108 (RUN ALONE: org_level
  community_cluster before chapter; roles cluster_coordinator,
  assistant_cluster_coordinator) + 109 (ten-position master list, cluster
  term, network-filtered leadership tree/reports-to/direct reports,
  report_open null-date fix, position_master-driven scope functions);
  #/claim door fixed (gBtn/gHint were declared inside step2 and used in
  step1; blank card since Google button landed); welcome band = name, ID,
  full name, network, designation; Institute link + Templates & Tools
  (10 HQ templates as PDF to read + originals to download, in
  app/content/templates) in the leader menu; Leadership Structure has
  WGMN / WNNN CTAs; HQ dashboard shows live leaders total, by level, by
  country, coverage, reports, programmes and no longer shows the
  14-day journey card to HQ; labels: State Coordinator, Assistant State
  Coordinator, LGA Coordinator, ... Chapter Lead, Assistant Chapter Lead.
  Ngunan Addingi (beekasinvest@gmail.com) = CR Nigeria: steps in
  docs/ONBOARD-NGUNAN-ADDINGI.md, photo in docs/photos/.
  v67.1 = auth diagnostics: every auth event logged to localStorage
  (wdos.authlog, last 30, shown on #/doctor); a SIGNED_OUT the user did
  not click is re-checked after 800 ms and ignored if the session is
  still live; otherwise the login form shows the time, page and build of
  the automatic sign-out (auth.autoSignedOut). Open symptom 6 Sep: HQ
  account signs in, Home shell renders, then bounces to #/login; cause
  not yet proven, the log will name it.
  v67.0 = Phase 134 Reporting & Accountability (founder's Final Functional
  Specification v1.0): migration 107, page #/reporting, see
  docs/PHASE134-REPORTING-ACCOUNTABILITY.md for the spec coverage table.
  v66.6 = sign-in/Google fixes: getMyProfile() now retries briefly and
  uses maybeSingle so the profile-row race right after sign-in (Google
  most of all) no longer bounces the person to #/login or a dead screen;
  hasProfile() added; the OAuth landing guard waits for the profile row,
  not just the session, and lands on #/login?oauth=failed on provider
  error; Google redirectTo now returns to <origin>/#/ (was bare origin)
  with prompt=select_account; login page shows a Google error message.
  v66.5 = certificate footer prints woddicrm.org (was the Netlify host).
  v66.4 = Phase 135 Volunteer Leadership Structure (founder's standard):
  migrations 105 (two new positions, RUN ALONE) + 106 (appointment_status,
  level_terms per country, position_master, reports-to fix, direct reports,
  structure_explorer); page #/structure; see docs/PHASE135-LEADERSHIP-
  STRUCTURE.md.
  v66.3 = v66.2 + HQ photo control: #/accounts → Photo (upload/remove a
  leader's picture; storage policy from 016 already lets HQ roles write
  any avatar, so no migration) and photos on Leader Atlas rows.
  If the badge is lower, the newest zip was not deployed yet.
  v66.1 = Phase 133 Network Command (#/command, migration 104, see
  docs/PHASE133-NETWORK-COMMAND.md). v66.2 = v66.1 + three fixes:
  (a) accounts.js: needFn was a const declared after render() returned
  (temporal dead zone, same species as the v65.0 CONVENING bug), so
  Create login / Add leader / Reset password / Change email / Suspend /
  Delete threw silently on click; now a hoisted function; (b) home.js:
  a dashboard render finishing after the route moved to #/login no
  longer clears the page (it drew its error card over the login form
  when a session was dropped) and a not-signed-in bundle error goes to
  #/login; (c) app.js authed(): no profile = no session → #/login.
- Database: migrations 001 to 103. 103 (Phase 131) adds referrals,
  volunteer_home(pid) (one-call dashboard bundle + HQ view-as), HQ account
  RPCs (hq_account_list, hq_update_profile, hq_set_status, hq_set_role,
  hq_end_roles, hq_link_directory), audience-aware meetings_read,
  coordinator_line messaging. 104 (Phase 133) adds org_unit_ancestors,
  member_stage, network_command. Both MUST be applied (badge db 104).
- Supabase: org "WODDI Database", project ref vhudbuprjpsyizporkcn.
  Pro plan PAID 31 Aug 2026. Compute should be Micro (verify under
  Project Settings → Compute and Disk / Add-ons / Infrastructure).
- Edge Functions deployed (all must show green in Dashboard → Edge
  Functions): meeting-token, transcribe, speak, translate, push-send,
  admin-users (NEW in Phase 131: HQ creates logins, resets passwords,
  changes email, suspends, deletes; needs no new secret; Verify JWT on).
  Secrets: JAAS_APP_ID, JAAS_KID, JAAS_PRIVATE_KEY (or _B64) for the
  embedded call; GROQ_API_KEY shared by transcribe, speak, translate.
  All functions deployed via the dashboard editor with "Verify JWT" on.
- Google sign-in: Google Cloud OAuth client with redirect
  https://vhudbuprjpsyizporkcn.supabase.co/auth/v1/callback; Supabase
  Providers → Google enabled; URL configuration Site URL woddicrm.org
  plus both Netlify mirrors. The router owns the OAuth landing guard.
- Org settings (table org_settings, jsonb values) that shape behaviour:
  call_mode ('embedded' default, 'tab' = open-in-new-tab call),
  call_raw_voice ('on' lets the speaker's real voice into the call;
  default off = booth mode), tts_space (URL of the Hugging Face voice
  Space, NOT YET SET), call_domain (optional custom Jitsi domain),
  email_enabled.

## 3. Deploy ritual (novice, browser-only)

1. Run any new numbered migration in Supabase → SQL Editor (in order).
2. Unzip the newest package; drag the `app` folder onto BOTH Netlify
   sites (Deploys tab drop area).
3. Hard refresh (Ctrl+Shift+R); confirm the corner badge version.
4. Phones: close the tab completely and reopen (PWA caches cling).
5. New Edge Function? Dashboard → Edge Functions → Deploy new function
   → editor → name EXACTLY as the folder → paste the index.ts → Verify
   JWT on → Deploy.

## 4. Files that matter (keep local copies; sandboxes reset)

- wdos-v83.8-place-by-level.zip = THE authoritative app package (supersedes v83.7)
  (cumulative: app + supabase/migrations + supabase/functions + docs).
- woddi-voice-space.zip = Hugging Face Docker Space (app.py, Dockerfile,
  requirements.txt, README.md, test.html) giving free voices for
  fr/pt/ar/sw/ha/yo/ig. NOT yet deployed.
- PROVISION-REGINA-OKORO.sql = Regina's account script (country rep
  version; see section 7).
- 103_volunteer_home_hq_control.sql = migration 103 (applied if the
  badge shows db 103 or higher). 104_network_command.sql = migration 104.
  admin-users/index.ts = the Phase 131 Edge Function (must be deployed
  for Create login / Reset password / Change email / Suspend / Delete).
- docs/ inside the zip: PHASE124-EMBEDDED-CALL.md, PHASE127-CLOUD-EARS.md,
  PHASE128-SENTENCE-FLOW-BOOTH-VOICE.md,
  PHASE131-VOLUNTEER-DASHBOARD-HQ-CONTROL.md, PHASE133-NETWORK-COMMAND.md,
  PHASE135-LEADERSHIP-STRUCTURE.md, PHASE134-REPORTING-ACCOUNTABILITY.md,
  and this handoff.

## 5. The multilingual meeting room (how it works now)

Layers: (a) video = Jitsi as a Service (8x8.vc) embedded INSIDE the room
page via the meeting-token function (no time limit; free to 25 monthly
users, then paid); (b) interpreter lane = the page itself.

Speaking = push-to-talk with sentence flow: tap Speak once, talk
naturally; an AudioContext volume detector cuts a clip at each pause
(≥400 ms speech then ≥700 ms silence), MediaRecorder records each
sentence (works in EVERY browser: Chrome, Edge, Safari, Firefox,
phones), the clip goes to the transcribe function → Groq Whisper
(whisper-large-v3-turbo) → text → broadcast over Supabase Realtime
('cap' events) → each listener's device translates into its own
hear-language (lane order: device translator → translate function via
Groq llama-3.1-8b-instant → org AI key → MyMemory → passthrough) → voice
(device voice → speak function via Groq Orpheus for ar/en → Space voice
for the rest → text only). Booth mode: the speaker's real voice does not
enter the call; listeners hear only the interpreter, including listeners
in the speaker's own language.

Rules for a meeting: every participant sets BOTH pickers ("I speak" and
"Hear in") to their OWN language; HQ = English/English. Solo test needs
speak ≠ hear. Earphones. One person speaks at a time, in sentences. Keep
the WDOS tab in front while speaking. Chrome is no longer required
(cloud ears), but the old browser recogniser remains the fallback when
the transcribe function is unreachable.

On-screen diagnostics (read these before touching code): version badge;
grey "Cloud interpreter ready" line; chip states listening… /
understanding… with a live level bar; grey "Interpreter microphone:
<device>" line; red lines: "microphone heard nothing", "cloud interpreter
could not process", "translation fell back", "no voice for this
language", "embedded call not configured (…)"; in-room version
handshake chips naming any device on an old build.

Known limits: Groq free tier (generous for meetings, not millions);
cloud TTS ~100 requests/day (device voice packs are the unlimited path);
Yoruba/Hausa/Igbo hear-only (Whisper weak for them); the free Space
sleeps and takes ~1 min to wake (the room pings /warmup on open).

Pending in this area:
- Deploy the voice Space and set org setting tts_space (see section 9).
- Laptop microphone: Windows meter moves but the page heard nothing →
  Chrome using a different device or Windows "Let desktop apps access
  microphone" off; v64.7+ shows the device name and level bar.
- Resilience: one failed meeting-token fetch abandons the embedded call
  for the session; retry hardening offered, not yet ordered.
- Azeez's clarification still owed: "video call embedded inside their
  dashboard" = Meeting Room page (already embedded) or home Dashboard
  screen (new build)?
- Founder's seven deliverables (section 8) after the call works on her
  phone.

## 6. Membership, approval, sign-in (state)

- Two registration doors, both instant-approve since migration 100:
  #/volunteer and #/apply. Claim login at #/claim with the same email.
  Google sign-in on login + claim (Google replaces the password only; the
  forms remain the door because they carry the age question that decides
  the network).
- Age rule: WNNN 18-29, WGMN 30+ (forms derive network). Existing members
  were never retroactively reassigned (no age data).
- Activation: 14-Day Activation Journey; 75 passed (62 WGMN / 13 WNNN);
  founder's extension ended 31 Aug; WGMN go-live was 1 Sep.
- Open cosmetic bug: stray "null" above "Welcome to WODDI" on the #/claim
  success screen. Open gap: Google sign-in without prior registration
  lands as a bare profile.

## 7. Regina Okoro (the first real leader account)

- Email uchechukwuokori81@gmail.com (credentials are NOT recorded here;
  HQ can reset via Supabase → Authentication → Users → Send password
  recovery).
- Auth user EXISTS (created after migration 102). Provisioning script
  (country rep version) ends any HQ-team role, deactivates the HQ staff
  row, sets names, walks member status legally to active, and assigns
  role country_rep at a seat: v_seat = 'ALL' (seated on the HQ unit;
  countries are its direct children, so scope = every country = "Super
  Country Representative" with country-rep powers and NO HQ screens) or
  'Nigeria' (one country). Azeez's seat choice is still PENDING.
- Her #/me crashed with "Cannot access 'CONVENING' before initialization"
  (a constant declared inside render() after the page was drawn); fixed
  in v65.0 by hoisting it to module scope. Verify her #/me loads after
  deploy.
- From v66.0 seat her from #/accounts → Role / seat (country_rep at
  WODDI HQ = every country, or at Nigeria = one country); the SQL script
  is no longer needed for seating. Then "View as" shows her dashboard.
- What a country rep can do from v66.0: the Volunteer Dashboard with My
  Leadership (every seat in her subtree, filled/vacant, members in scope,
  message any leader below her, refer candidates for vacant seats),
  Tasks, Meetings, Announcements, Recruitment for her scope. Still not
  hers: the Members list module and the Leader Atlas (HQ-only), task
  assignment aimed at leaders (assignee search is staff-oriented).

## 8. Queued builds

Phase 131 BUILT in v66.0 (see docs/PHASE131-VOLUNTEER-DASHBOARD-HQ-
CONTROL.md): Volunteer Dashboard per Azeez's mockup for members and
leaders; My Leadership hierarchy tree; referrals ladder; HQ #/accounts
(create login, view as, edit, seat, status, reset password, change
email, suspend/restore, delete); last_seen_at refresh on activity.
Position held: no plaintext passwords ever (temporary password shown
once, resettable any time).

Phase 132 (founder's leader-dashboard extras, not yet ordered):
1. Leadership pipeline funnel (referred → registered → activation →
   selected → appointed → onboarding → active) per scope.
2. Programme request workflow (submit → HQ review → approved/modify/
   declined → implementation → evidence → closed).
3. Reporting & performance scores per state/LGA, monthly report due dates.
4. Organogram map view; role-personalised resource packs.
5. Task assignment to leaders in scope (assignee search).
6. Community Cluster as an org level (migration touching org_level).

Founder's Multilingual Virtual Meeting System deliverables (written
spec, 29 Aug): system architecture; one-tap user journey;
language/translation architecture; scalability/capacity plan;
load/stress test report; security/backup/failover plan; HQ operational
dashboard framework; plus an ordinary-user readiness test. Scale target:
hundreds of thousands to millions across 55 countries; leaders create
their own meetings at their level. To be written after the call works
on H.E.'s phone.

Other open items: extension email tail (send_extension_emails(120) until
remaining 0, if not already); "Completed late" verdict label; network +
contact columns in the activation export; enriched query for the 75
passed (role/country/state for the 13 recent); Brevo DKIM (sender is a
gmail address); student feedback forms tally offer; Phase 125 (JaaS
server-side transcription, needs founder's card) scoped, not built.

## 9. Voice Space deployment (browser only)

huggingface.co → New Space → name woddi-voice → SDK Docker → CPU basic
free → Create → Files → Upload the 5 files from woddi-voice-space.zip →
wait for "Running" (5-15 min first build) → open
https://<username>-woddi-voice.hf.space/test and hear each language →
then in SQL Editor:
insert into org_settings (key, value) values ('tts_space',
'"https://<username>-woddi-voice.hf.space"'::jsonb) on conflict (key) do
update set value = excluded.value;

## 10. Working rules (learned the hard way)

- Evidence first. Most "not working" reports were: undeployed build,
  cached phone, Microsoft Edge (before cloud ears), wrong picker config,
  a missing function deployment, or a network blip. Always ask for the
  badge on EVERY device and the on-screen diagnostic line before code.
- Parallel chats: Azeez sometimes runs two chats on the same workspace.
  Before editing, check the tree version and newest zip; converge to ONE
  cumulative zip; keep the established design.
- SQL: a migration that ADDS an enum value must be its own file and run
  alone (105); the next file may then use the value.
- SQL: check 8 = name collisions (harness/namecheck.py): a function, table
  or type name reused from an earlier migration fails unless the file
  marks it '-- redefines <name>'. 107 originally reused
  can_review_report from 015 and Postgres refused the parameter rename.
- SQL: check 7 = parse with the real PostgreSQL grammar (pglast, script
  /home/claude/harness/sqlcheck.py, function bodies included) before any
  migration ships; the 6-check alone missed a misplaced FROM in 106.
- SQL: 6-check verification before any migration (paren balance,
  RAISE+||, self-comparison, bare row, HQ-guard shape, Python simulation
  of the logic). Migrations are numbered; schema_migrations rows;
  EXPECTED_SCHEMA_VERSION in app/js/core/db.js must match.
- JS: node --check parses a .js file as a SCRIPT and misses module-only
  errors (a bracket error passed it in v67.0 and failed the ESM import);
  the harness sweep (real ES module import) is the check that counts.
- JS: node --check at minimum; the harness (shim.mjs + sweep.mjs, 66/66
  modules clean, static import resolution) plus the jsdom render test
  (render-test.mjs + fixtures: member home, eleven tabs, leader tree,
  view-as, Accounts page AND a click on every Accounts action) live at
  /home/claude/harness and must be rebuilt after a sandbox reset.
- Never declare a const/let after a page's return statement if any
  handler uses it: it stays in the temporal dead zone forever (CONVENING
  in v65.0, needFn in v66.1). Use function declarations for helpers.
- Documents to the founder: humanized, NO em dashes, no gendered
  pronouns except the title "Her Excellency", branded reportlab PDFs
  (magenta header band, lemon motto). Never fabricate data the system
  did not capture.
- Deployment instructions: novice level, browser only, no command line.
- Never display or store passwords. Temporary password shown once; reset
  any time.
- Dashboard numbers are counts of real rows only. If the system never
  captured something (e.g. women reached before beneficiaries are
  recorded) it shows 0, not a placeholder.

## 11. Useful SQL

- Regina check: select p.first_name, p.last_name, p.status, ra.role,
  ou.name, u.last_sign_in_at from profiles p join role_assignments ra on
  ra.profile_id = p.id and ra.ends_at is null join org_units ou on ou.id
  = ra.org_unit_id join auth.users u on u.id = p.id where lower(p.email)
  = 'uchechukwuokori81@gmail.com';
- Call mode: insert into org_settings (key, value) values ('call_mode',
  '"embedded"'::jsonb) on conflict (key) do update set value =
  excluded.value;  (use '"tab"' for the open-tab call)
- Raw voice: same shape with key call_raw_voice and value '"on"'.
- Count closed journeys: select count(*) from activation_journeys where
  status = 'incomplete';
- Referrals waiting for HQ: select ref_no, category, reason, status,
  created_at from referrals where status = 'submitted' order by created_at;
- Who has no login yet (directory only): select member_code, first_name,
  last_name, email, country from leader_directory where claimed_profile
  is null;

## 12. People

- Regina Okoro: Head of Field and Country Operations; first real leader
  account (section 7).
- Fred Ogbole: independent QA tester; GO recommendation for 1 Sep launch
  delivered 21 Aug.
- Tobi Ajayi: graphics designer (guide graphics).
- Founder (H.E.): reads reports closely, catches data discrepancies,
  issued the seven-deliverable multilingual spec.

## 13. Sandbox notes for the assistant

Working tree lives at /home/claude/wdos-v64 (or /home/claude/wdos);
restore from the newest zip if the sandbox reset (uploads at
/mnt/user-data/uploads, outputs at /mnt/user-data/outputs). The
persistent memory file /areas/wdos.md holds the full dated history and
is the source of truth if this document and the memory ever disagree
(memory is newer).
