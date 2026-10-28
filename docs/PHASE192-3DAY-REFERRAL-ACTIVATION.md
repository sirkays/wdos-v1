# PHASE 192 - The 3-Day Referral Activation (and the 7-Day open-call route)
Build v82.3 · db 146 · 17 Sep 2026 (app + ONE migration: 146_activation_routes.sql)

The Founder: "create the link that the referrals will use to log in and do
the 3 days exercise". Built to the "WDOS 3-Day & 7-Day Activation Programme
Content Pack FINAL": every day title, instruction, acknowledgement, question,
scenario and the 13-question Leadership Understanding & Readiness Assessment
are loaded word for word. Nothing was written by the developer.

## The link
HQ, or any serving leader, creates a 3-Day link for a NAMED seat: network,
position and place. It looks like woddicrm.org/#/join/CODE and opens the
signup form directly with those three already set. The referred person
enters her name, email, phone, date of birth and a password, agrees to the
privacy notice, and lands on Day 1 signed in. Her age is checked against the
link's network (18-29 WNNN, 30+ WGMN) so a wrong-network link is caught
before an account is made. Each visit and each registration is recorded
against the link, so the referring leader is credited.
- HQ: Activation & Readiness page -> Create a 3-Day referral link.
- Leaders: My Referrals -> Create a 3-Day referral link (limited to seats
  below country level), with a WhatsApp share button.

## The candidate's three days (#/activation)
Progress bar, numbered day dots, deadline, and the non-negotiable notice on
every screen: "Access to this pack is for assessment. It does not constitute
appointment." One day at a time; the next opens only when the current one is
complete. Every answer auto-saves as she types, so a dropped connection costs
nothing and she resumes from where she stopped.
- Day 1: WODDI, her network and the role being considered. Profile confirmed
  (not re-entered), the manual sections shown inside the step, two questions.
- Day 2: the Leadership Pack (Candidate Edition), Code of Conduct, safeguarding,
  confidentiality, financial conduct and authority boundaries. Five
  acknowledgements, one scenario.
- Day 3: service readiness. One acknowledgement, one short response, then the
  13-question assessment. Submitted answers lock; a return creates a new
  version and the original is kept.
Statuses follow the pack exactly: Not Started / In Progress / Incomplete /
Completed; Extension Requested / Approved / Not Approved; Assessment Pending /
Submitted / Returned / Completed. Deadline 3 days (7 for the open route),
configurable in activation_settings, never hard-coded. Extension is asked by
the candidate and decided by HQ with a recorded approver and reason.

## The 7-Day open-call route
Seeded from the same pack (seven days) and opened by HQ for a screened
applicant with open_activation_for(). Same assessment, same standards.

## HQ master dashboard and analytics
- Command Centre (Founder) and HOFCO dashboards carry an Activation &
  Readiness card: link visits, registrations, in progress, completed,
  assessments submitted, returned, selected, extensions waiting. It opens
  the full page.
- #/hq/activation (sidebar: Recruitment -> Activation & Readiness):
  the funnel per route (started, in progress, completed, incomplete,
  extensions, assessment submitted / returned / reviewed, selected, reserve,
  further review, not selected, average days to complete, average score);
  day-by-day reached and completed with the completion rate, for both routes;
  by network; by country; by referring leader; and the candidate list with
  route, position, status, day, deadline, assessment, score (with the
  critical-rule flag) and outcome.
- Review: the reviewer sees every day's answers and acknowledgements, scores
  each of the 13 questions 2/1/0 with an internal comment, can return for
  correction with a note the candidate sees, and completes with an outcome
  (further review, selected, reserve, alternative role, not selected) and the
  message the candidate is shown. Internal scores and comments never reach
  the candidate. No outcome creates an appointment; that stays with the
  separate appointment process.

## Deploy
1. SQL Editor -> run supabase/migrations/146_activation_routes.sql
   (after 143, 144, 145).
2. Drag `app` (v82.3) to both sites -> badge "build v82.3 · db 146".
3. As HQ: Recruitment -> Activation & Readiness -> create a link for a real
   seat -> open it in a private window and register as a test candidate.

## Not built (stated plainly)
- Screening before the 3-Day route: the pack says a referred person is
  contacted and screened first. Today the link itself is the gate; whoever
  holds the link is treated as screened. HQ can withdraw a link at any time.
- Candidate email prompts ("Your Day 2 step is ready"): the approved wording
  is loaded in activation_messages but the send is not wired to the mailer.
- Message content in languages other than English.

## v82.4 - where it is in the HQ sidebars
The HQ function sidebars come from assets/hq-sidebars.json, not from the
leader menu, and "Recruitment" is a leader-menu heading. Activation &
Readiness now appears in the Founder sidebar (after Decisions & Approvals),
HOFCO (after Recruitment & Activation), Secretary, Administration and QA.
Leaders reach the link creator from My Referrals.

## v82.5 - #/hq/activation spun forever; the page is now in plain sight
Cause, mine: the authed() route wrapper expects a page MODULE with a
render(outlet, params, ctx) method. I registered #/activation and
#/hq/activation with bare functions, so page.render was undefined, the
wrapper threw, and the router sat on its spinner with no shell around it.
Fixed: both routes are registered as modules; the HQ page renders inside
the HQ shell (sidebar stays), the candidate page inside the volunteer shell.
In plain sight: a "3-Day referral link & activation" button now sits in the
Command Centre's top action row and first in HOFCO's Quick actions, as well
as the sidebar entry.

## v82.6 (Phase 193, migration 147) - every link tracked individually
Azeez: there must be an option to track each link.
- hq_link_tracking(): per link, who made it, for which seat, when, whether it
  is live, visits (all time and last 7 days), last opened, registrations,
  in progress, completed, incomplete, assessments submitted, selected, not
  selected, and the list of candidates who came through it with their day,
  status, assessment and outcome. HQ sees every link; a leader sees hers.
- referral_link_set(): pause, resume or withdraw a link.
- On the HQ Activation & Readiness page: "Your 3-Day links, one by one",
  each link as an expandable card with its stats, the URL, Copy, WhatsApp,
  Pause/Resume, and its candidates. The same card list appears for a leader
  under My Referrals, limited to her own links.

## v82.7 (Phase 194) - the signup form, from the first phone screenshot
Azeez's screenshot of woddicrm.org/#/join/RRRVVH84 on a phone showed four
faults and set two rules.
- "{role}, {place}" printed literally: the intro was given only the
  referrer's name. It now receives the position and place from the link.
- "apply.firstName" / "apply.lastName" printed as raw keys: those keys never
  existed. The fields use the real First name / Last name labels.
- Phone was optional. It is now required and validated (digits with country
  code, 7-20 characters).
- No photograph. The form has a photograph field with a live round preview;
  it is required (under 5 MB), uploaded to her avatar straight after the
  account is created, so her first dashboard shows her own face.
The rule, enforced in code: a candidate is NOT a volunteer leader. She holds
no seat and is_leader stays false. From sign-in until her activation is
complete AND HQ has recorded "selected", every address in WDOS redirects to
#/activation except her profile, settings, help and sign-out; her sidebar
carries no operational modules. Only the appointment process, after HQ's
decision, makes her a leader and opens the dashboard.

## v82.8 (Phase 195) - brand header and language on the join form
Top of the form: the WODDI "the nurturer" wordmark on the left, the language
selector on the right (same eight languages as the app header; a change
reloads the form in that language and is remembered on the device). Below
it, centred, the network's own logo: the WGMN Good Mother Network wordmark
for WGMN links, the WNNN disc for WNNN links. Both logos are the files Azeez
supplied, trimmed and bundled at assets/logos/.
