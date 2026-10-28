# PHASE 198 - Revised assessment, network choice, ranking, and a full audit
Build v83.2 · db 150 · 18 Sep 2026 (app + ONE migration: 150_revised_readiness_assessment_ranking.sql)

## 1. Bug: "cannot execute UPDATE in a read-only transaction" on #/hq/activation
Mine. hq_activation_master was declared STABLE (read-only) but its first line
runs the deadline sweep, which UPDATEs. Postgres refused. It is now volatile,
like the older analytics function. Nothing else was wrong with the page.

## 2. The form (#/join/WODDI)
- Two network buttons at the top of the form: WGMN in magenta, WNNN in lemon
  green, with a one-line description each. She must choose one. The choice is
  stored on her activation (network_chosen) together with her age, and HQ sees
  both; if her date of birth does not match the network she chose, the form
  tells her and HQ sees a warning on her card and in the ranking.
- Copy replaced with the Founder's wording: the welcome paragraph (three
  sentences, with "position you are being considered for", "where you will
  serve" and "Referral Activation" in bold), the badge "Referral Activation",
  and the notice "Referral and activation are important steps in the process,
  but they do not guarantee appointment. Activation helps assess readiness for
  the role." The photograph hint line is removed.
- Languages are chips in plain sight, all eight visible, current one filled.

## 3. The three days can be done in one sitting
There was never a calendar wait: a day unlocks the moment the previous one is
complete. She can finish all three in one stretch. The 3-day deadline is the
outer limit, not a pace.

## 4. The revised Understanding & Readiness Assessment (Day 3)
Built to "WGMN Leadership Activation: Understanding & Readiness Assessment
(REVISED)", as a soft form with progression, not a document:
- Step 1 Candidate information, filled from her record (name, country,
  position, entry pathway, start date, network) plus the purpose and the
  "does not mean you have been appointed" line.
- Steps 2-9: sections A to H, 30 statements, each with Yes I understand /
  Need clarification. Next is refused until every statement in the section
  has an answer.
- Step 10: section I, the four short questions plus question 5 (clarification
  needed? No / Yes, state briefly).
- Step 11: section J, the three confirmations, the readiness choice (ready /
  interested but need clarification / do not wish to proceed), and the
  digital confirmation (typed full name, dated on submit).
A progress bar and "Step n of 11", Back and Next buttons, a returned note
shown at the top when HQ sends it back. Answers lock on submit; a resubmission
keeps the earlier answers in the record. The WNNN version is the same
structure with the network name switched.

## 5. HQ: review, and ranking when several women complete for the same seat
- Review: the statements she marked Need clarification (with their text), her
  short answers, a reviewer score out of 8 for the short answers, and the
  HQ-use block exactly as on the form: Understanding review (satisfactory /
  further discussion required), Recommended next stage (proceed / further
  review / do not proceed), comments. Return for correction with a note, or
  record the outcome and the message she is shown.
- Ranking: "Candidates for the same seat, ranked". Completed candidates
  grouped by position + country + state + LGA + community cluster. Within a
  group they are ranked by a transparent score out of 100: understanding 40
  (share of statements answered Yes), short answers 30 (reviewer's score /8),
  readiness 20 (ready 20, interested 10, not now 0), completion 10 (all
  confirmations ticked and finished within the window). Ties: fewer
  clarifications, then earlier completion. Every criterion is shown as its
  own column (understood /30, clarifications, short answers, readiness, days
  taken, on time, age band, HQ review, outcome), so the rank is explainable.
  The rank is guidance; the decision stays with HQ.
- The candidate card shows the chosen network, the age-band check, rank
  score, clarifications, readiness, understanding review and next stage.

## 6. Audit of the whole app (this build)
- Every JS module and the service worker pass a syntax check.
- Every locale file and every JSON asset parses.
- Every file in the service worker precache list exists (258 files).
- Every SVG shipped renders (the 36 broken monthly ones were fixed in v82.1).
- Locale keys: 26 keys were used in code but missing from en.json, 16 of
  them on the candidate's activation page (raw keys would have shown). All
  added, in English and French; French now has every English key.
- Database: one function that writes was declared read-only (item 1). No
  other STABLE function writes.
- Routes: both new pages are registered as modules (the v82.5 bug class);
  no other route is registered as a bare function.
- Sessions: persistSession + autoRefreshToken are on, the session lives per
  window with a shared seed (v80.8), and no code path signs a user out on
  its own. The reload loop was removed in v82.2.

## What I could not audit from here
Live behaviour under load, real sign-out reports, and the RPC timings. If a
leader or HQ is still signed out, send the "Why was I signed out?" panel text
and the browser console; I will trace it rather than guess.

## Deploy
1. SQL Editor -> run 150_revised_readiness_assessment_ranking.sql (after 149).
2. Drag `app` (v83.2) to both sites -> badge "build v83.2 · db 150".
3. Open #/hq/activation: it must render. Open the WODDI link on a phone: the
   two network buttons, the new wording, the language chips.
