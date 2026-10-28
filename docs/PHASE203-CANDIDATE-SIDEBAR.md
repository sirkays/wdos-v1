# PHASE 203 - The candidate's sidebar, two display bugs, and the access spec
Build v83.7 · db 155 · 18 Sep 2026 (app + ONE migration: 155_activation_last_name.sql)

From Azeez's phone screenshots after the activation finally opened:
- The sidebar still showed the whole leader menu (Recruitment, 7-Day
  Activation, Meetings, Members). Candidates now get their own sidebar:
  Referral Activation, My Profile, Support, Settings, Sign out, and a note
  that the dashboard opens after activation and appointment. Nothing else is
  in the menu, and every other address already redirects to the activation.
- "null" printed above the progress bar: a placeholder node was appended
  literally. Removed.
- "Ade undefined" in Candidate information: the activation did not return
  her last name. Migration 155 adds last_name (and the full network name and
  a combined place line) to my_activation().
- The role-based access specification is written at
  docs/WDOS-ROLE-BASED-ACCESS.md: candidate, member, leader and HQ, what each
  sees, what each can do, what is captured, and how to test it.

## Deploy
1. SQL Editor -> 155_activation_last_name.sql (after 154).
2. Drag `app` (v83.7) to both sites -> badge "build v83.7 · db 155".
3. Sign in as Ade Test on the phone: the sidebar must show only the four
   candidate items; her full name must appear in Candidate information.

## v83.8 (Phase 204, migration 156) - the place follows the position's level
Mfon on the laptop: "Country Representative, Gwarimpa". The form captured
her whole line (country, state, LGA, community cluster) and the screen took
the smallest unit. Now a Country Representative is shown for the country, a
State Coordinator or Secretary for the state, an LGA role for the LGA, a
cluster or chapter role for the community cluster. The same rule sets the
place on the HQ register cards and the groups in the ranking, so two
Country Representative candidates for Nigeria are compared together
whatever LGA they live in. Her full line is still kept and shown beneath.

## v83.8 (Phase 204, migration 156) - the place matches the position's level
Mfon's test read "Country Representative, Gwarimpa". Gwarimpa is where she
lives; a Country Representative is considered for the country. The place
shown with a position now follows the position's level: country for CR and
Deputy; state for State Coordinator, Assistant and Secretary; LGA for LGA
roles; community cluster for cluster and chapter roles. Her full address is
still captured and shown to HQ as "Lives at". The form says so under the
position field.

## v83.9 (Phase 205) - "Signing you in..." stuck for minutes
Sign-in itself had a 45-second timeout and passed. The line AFTER it,
auth.getUser(), had none, and in this app it can wait forever: the sign-in
event handler holds the auth lock while it backs up the session, and
getUser() queues behind it (a known supabase-js lock deadlock). Fixed:
- the form never calls getUser(); it uses the session that sign-in returned;
- a 90-second hard stop on the whole flow: whatever step is stuck, the form
  says so and shows "Continue to my activation" (the account exists by then,
  and the activation page completes anything unsaved).
App only, no SQL.

## v84.0 (Phase 206) - a cleaner activation screen
- The "Your details" block (name, email, phone, network, country, position,
  Edit my details) is removed from every day. Her details live on My Profile.
- The "Open in a new tab" button on the document bar is removed; the
  document is read inside the step, where reading is recorded.
- The Leadership Manual's welcome no longer promises "fourteen days"; it is
  read on the 3-Day and the 7-Day routes alike and now says "the coming
  days of your activation".
App only, no SQL.
