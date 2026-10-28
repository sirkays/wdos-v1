# PHASE 214 - Leaders' issues: onboarding stuck, Google sign-in, Burundi name
Build v84.9 · db 165 (ALREADY LIVE via the Supabase connector) · 2 Oct 2026. To deploy: drag `app` to both Netlify sites. Nothing to run in the SQL Editor.

## 1. Onboarding stuck on "This step is done on another page" (Osun SC step 9, Chad CR step 2)
**What leaders saw:**
- Osun: "Step 9 is reporting template which is hindering me from getting to 10", with Next stuck at "Next (1s)".
- Chad (in French): "Je n'arrive pas à continuer", stuck at step 2 of 10.
- The WODDI mailbox stays locked until onboarding is finished.

**Cause (two faults, both in the app):**
- Steps 2, 9 and 10 are "visit" steps: they send the leader to another WDOS page. The onboarding page remembered "she opened it" only in its own memory, which is lost the moment she leaves. Coming back always showed the step as not opened, so Next could never unlock. "Next (1s)" was the timer reaching zero while the real blocker, "page not opened", was never shown.
- Step 2 opens My Network (`#/my/network`), but the onboarding gate (only a few pages allowed until onboarding is done) refused that page and sent her straight back. She could not even see the page the step asks for.

**Live data on 2 Oct:** of the leaders who have started onboarding, every one who was stuck was stuck on a visit step:
- 7 on step 2: Chad CR, Ebonyi ASC, Guinea-Bissau CR, Kaduna SC, Kogi SC, and 2 seats on WODDI HQ.
- 2 on step 9: Osun SC and South Africa CR.

**Fix:**
- New `js/core/obvisit.js`. Pressing "Open the page" keeps a small record in the browser (who, which step, which page).
- That page is let through the onboarding gate.
- A bar at the bottom of the page shows the step and "Back to onboarding".
- After 3 seconds on the page the step is recorded as done on the server, and the bar changes to "Step N done · Continue my onboarding".
- If the server cannot be reached, or she comes back at once, the record alone unlocks Next on the onboarding page.
- The Next button now says what is missing ("Open the page first", "Read to the end first") instead of a countdown that never ends.
- English and French.

Nothing was marked done for anyone by hand: each leader still opens the page herself. After deploying, the 9 leaders above press "Open the page" once more and continue.

## 2. Uganda DCR cannot sign in (and Google sign-in for everyone since about 6 Sep)
**What the logs show for Mundrua Margaret (Uganda DCR):**
- 1 Oct: three password attempts, all "invalid credentials".
- She then used "Continue with Google": Supabase accepted it, but her phone (Android Chrome 138) made no further request at all. The sign-in never reached WDOS, and she was left on the sign-in form.
- She has four Google sessions since 23 Sep. None was ever used. Her last real activity was 11 Sep.

**Not just her:**
- The Burundi CR did the same on 23 Sep: Google twice, nothing, then three wrong passwords, then in with her password.
- A leader on 21 Sep had the same experience.
- On 5 Sep Google sign-in still worked: callback, then the user check 5 seconds later.

**Cause (my error, in v66.6, about 6 Sep):** the Google return address was changed from the bare site address to `<site>/#/`. Supabase adds its tokens after another `#`, so people landed on `#/#access_token=…`. The Supabase library cannot read that, so no session was created and the router showed the sign-in form with no message.

**Fix:**
- The return address is the bare site address again (what worked through 5 Sep).
- A landing on the old double-`#` address is repaired before the Supabase client starts, so links still in flight also work.
- If tokens arrive but do not become a session, the sign-in form now says "Google sign-in could not be completed" instead of nothing.

**For Mundrua specifically:** after deploying, "Continue with Google" works. Her password is wrong (three failures on 1 Oct); "Forgot password" will email her a reset link.

## 3. Burundi CR's name
She wrote: "My name is Alice Orly Umuvyeyi, not Museli". Her login email (aliceorlyumuvyeyi@gmail.com) and her Google account name agree.

Corrected live in all five places the surname was stored: profile, leader directory, both contact registers, and sign-in metadata. Record: `supabase/migrations/165_burundi_cr_name.sql`. No other "Museli" remains.

## Tested (real app in a browser; leader data from the live fixture; onboarding steps exactly as in the live table)
| Case | v84.8 | v84.9 |
|---|---|---|
| Chad: step 2, press "Open the page" | sent straight back; still 1/10 | My Network opens with the step bar; recorded after 3 s; back on onboarding at step 3 (2/10) |
| Osun: step 9, open the page and come straight back | "Next (1s)", disabled forever (her screenshot) | Next unlocks; pressing it records step 9 and shows step 10 (9/10) |
| Chad case in French | as above | same, all in French |
| Google landing on `#/#access_token=…` | sign-in form, zero calls to Supabase (Mundrua's logs) | signed in |
| Google landing on the new address | signed in | signed in |

Also rerun:
- The onboarding gate still blocks other pages (Tasks goes to onboarding), and candidates still go to Activation.
- End-to-end pages as Regina and as a leader: zero errors.
- Phase 212 sign-in scenarios (clock fast, stale form) and Phase 213 account-service cases still pass.
- Import checker: 1,147 names, 91 modules, 0 problems.

## Files
- New: `app/js/core/obvisit.js`, `supabase/migrations/165_burundi_cr_name.sql`
- Changed:
  - `app/js/pages/onboarding.js`
  - `app/js/pages/home.js` (gate, selfId)
  - `app/js/app.js` (gate, step bar, double-# repair)
  - `app/js/core/router.js` (failed-Google message)
  - `app/js/core/db.js` (Google return address, v84.9, schema 165)
  - `app/assets/css/wdos.css` (.ob-return)
  - `app/locales/en.json` and `fr.json` (5 keys)
  - `app/sw.js` (wdos-v84.9, precaches obvisit.js)
  - `app/index.html`
