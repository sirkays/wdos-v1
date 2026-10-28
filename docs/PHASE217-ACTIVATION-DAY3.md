# PHASE 217 - 3-Day referral activation: Day 3 could not be completed
Build v85.2 · db 169 (ALREADY LIVE via the Supabase connector) · 2 Oct 2026. To deploy the app: extract `wdos-v85.2-update.zip` over your `app` folder (replace files), then drag `app` to both Netlify sites. The pack also contains v85.1 (the audit fixes).

## What Regina reported
"Please remove the gate from Day 3 of the 3 days referral journey, candidates have complained that they cant complete day 3 and hence cant finish the program."

## What was actually happening
There was no time lock: each day opens as soon as the previous one is done. The "gate" was a fault.
- When a candidate pressed Next on the last day (Day 3, "Service Readiness & Assessment"), the database checked her answers and opened the readiness assessment, but left Day 3 marked "in progress".
- The activation page shows the first day that is not completed, so she got Day 3 again on every Next and never saw the assessment, which is the step that finishes the programme.
- The 7-Day activation's last day (Day 7) had the same fault.

**Live data (2 Oct):** every candidate who reached the end of Day 3 was stuck this way.
- **Abubaida Uthuman** (Uganda, today) is stuck now; her deadline is 5 Oct.
- **"okeke veps"** got stuck the same way on 21 Sep and was marked incomplete when the deadline passed. The email is a throwaway address (`@hideam.com`), so it is probably a tester; an extension was requested.
- One test account ("Ade Test") was stuck the same way.

## Fix
- **Database (migration 169, live):** the last day is now marked completed when it passes its checks, like every other day.
- **Repair (live):** candidates already stuck were repaired, but only where the database proves they passed Day 3's checks (their assessment record is created only after them). Checked as Abubaida herself: she now sees Days 1 to 3 completed and the assessment ready. This works on the live site without the new app version.
- **App (v85.2):** the activation page also treats the assessment day as done whenever an assessment exists, as a second safety net.

## Tested
- **Database:** on the test account, Day 3 put back to "in progress", then Next pressed as the candidate would (in a transaction that was rolled back). Day 3 completes and the assessment opens.
- **Browser, with a candidate in the old stuck state:**
  - v85.1 shows "Step 3 of 3, Service Readiness & Assessment" again (the complaint);
  - v85.2 shows the Understanding & Readiness Assessment.
- **Regression, all passing:**
  - end-to-end pages as Regina and as a leader;
  - the candidate gate;
  - onboarding (Chad and Osun cases);
  - the candidate sign-in loop;
  - import checker: 0 problems.

## Leaders' fixes confirmed (Regina's 1:44 PM request)
None of the four had signed in again since the fixes. Each dashboard was loaded on the database exactly as it loads for her, and all load correctly:

| Leader | Name in WDOS | Seat | Next step |
|---|---|---|---|
| Osun SC | Odekunle Rolake Gladys | State Coordinator, Osun | 9 of 10, Open the reporting templates (now completes) |
| Chad CR | Hinberka Beblere Florice | Country Rep, Chad | 2 of 10, Confirm my reporting line (now completes) |
| Uganda DCR | Mundrua Margaret | Deputy Country Rep, Uganda | Google sign-in fixed; onboarding 0/10 |
| Burundi CR | Alice Orly Umuvyeyi | Country Rep, Burundi | name corrected; onboarding 0/10 |

The onboarding and Google fixes were tested in the browser in Phase 214 and are in the live build (v85.0 on woddicrm.org at 16:32).

## Files
- `supabase/migrations/169_last_activation_day_completes.sql`
- `app/js/pages/activation.js`
- `app/js/core/db.js` (v85.2, schema 169)
- `app/sw.js` (wdos-v85.2)
- `app/index.html`
