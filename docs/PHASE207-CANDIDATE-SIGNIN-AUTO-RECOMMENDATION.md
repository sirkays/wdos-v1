# PHASE 207 - Candidate sign-in, the WODDI link, automatic recommendation
Build v84.1 · db 157 · 19 Sep 2026 (app + ONE migration: 157_auto_recommendation_and_appointment.sql)
Built to the Founder's "Technical Implementation & Readiness Checklist" (121 items).

## 1. "This link is not valid" at #/join/WODDI
Correct behaviour since Phase 199: the single WODDI link was paused when the
Founder asked for two forms. It now shows the Referral Activation sign-in
with the two form buttons instead of a dead end. The live forms are
#/join/WGMN and #/join/WNNN.

## 2. A separate door for candidates (#/candidate)
Referred candidates have their own sign-in page: WODDI wordmark, the two
network discs, "Continue my activation" (email + password, eye, forgot link),
and "Start my activation" with the two form buttons. Every referral form's
"Already have an account?" points here, and the leaders' sign-in page carries
a line "Referred for volunteer leadership? Use the Referral Activation
sign-in". A candidate never needs the leaders' page.

## 3. Automatic assessment and recommendation (checklist 48-49, 55-61)
On submission, WDOS assesses the candidate at once, no HQ input needed:
- Approved weights are settings, not code (activation_settings): understanding
  40, short answers 30, readiness 20, completion 10; thresholds 70 / 55 / 40,
  clarifications limit 3, tie margin 3. HQ changes them with one UPDATE.
- Short answers get a provisional automatic score out of 8 (effort-based);
  a reviewer may override, and the rank is recomputed.
- Speed counts: "time taken" is shown in hours or days, and finishing within
  the window is part of the score; earlier completion breaks ties.
- The system recommendation is set per candidate: Recommended, Reserve,
  Further review, Not recommended. Within a contested seat only the top
  candidate can be Recommended; the others become Reserve (qualified but
  position filled). Scores within the tie margin are flagged and both go to
  Further review (item 59).
## 4. Appointment: one click, but a human click (checklist 60, 61, 69, 70)
The Founder's checklist is explicit: "Final human approval step before
appointment" and "No automatic appointment solely from system score". So
WDOS recommends automatically and HQ presses ONE button, "Approve
appointment", on the ranking. That button seats her in the structure at the
level the position is for, flags her as a leader, walks her status to
activated, opens her full leadership dashboard, records who approved and
why, and marks every other completed candidate for that seat as Reserve with
the "qualified but position filled" message. Nothing else is needed.
If Management later decides the button itself should be automatic, it is a
one-line scheduled job on top of this; I have not built that because the
checklist forbids it.

## Deploy
1. SQL Editor -> 157_auto_recommendation_and_appointment.sql (after 156).
2. Drag `app` (v84.1) to both sites -> badge "build v84.1 · db 157".
3. Test: two fresh candidates through #/join/WGMN for the same position and
   place, both complete -> ranking shows both with a system recommendation ->
   Approve appointment on the top one -> she signs in and has the full
   dashboard; the other sees the reserve message.
