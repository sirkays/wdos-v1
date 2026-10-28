# PHASE 215 - Candidates signed out straight after signing in
Build v85.0 · db 165 (no database change) · 2 Oct 2026. To deploy: extract `wdos-v85.0-update.zip` over your `app` folder (replace files), then drag `app` to both Netlify sites.

## What the logs showed
A new 3-Day referral candidate (Uganda, Country Representative, referred by Regina; account created 13:33 Lagos time) signed in successfully five times between 14:01 and 14:04. Each time she was signed out about half a second later, with no data loaded in between. The sixth attempt worked.

## Cause (my error, introduced in v84.7)
1. The candidate sign-in page (`#/candidate`) and the referral forms (`#/join/...`) deliberately sign out whoever is signed in when they open, so a new candidate always starts clean (Phase 200/207).
2. v84.7 added two things: "after a sign-in ends unexpectedly, go to the sign-in form" and "after signing in, go back to the page you were on". It treated that deliberate sign-out as an unexpected one. It remembered `#/candidate` as the page to return to and moved her to the leaders' sign-in form.
3. Signing in there sent her "back" to `#/candidate`, which signed her out again, and the cycle repeated.

## Fix
- A public page (the candidate sign-in, the referral forms, registration and claim pages, the sign-in form) is never remembered as a page to return to.
- A sign-out that happens on a public page moves nobody anywhere: the page handles it.
- A sign-in in another window no longer re-draws a public page.
- New `isPublicHash()` in `js/core/router.js` decides this from the route list itself, so any public page added later is covered automatically.

## Tested (real app in a browser, simulated Supabase)
| Step | v84.9 | v85.0 |
|---|---|---|
| Signed in, opens the candidate sign-in page | moved to the leaders' form | stays on the candidate form (signed out once, as designed) |
| Signs in again (three tries) | each sign-in followed by a sign-out, still on the form (same as the logs) | signs in once and lands on Activation; no further sign-outs |
| Session ends on Activation, signs in again (Phase 212 return-to) | back on Activation | back on Activation |

Also rerun, all passing:
- Phase 214 onboarding (Chad and Osun cases) and Google sign-in;
- end-to-end pages as Regina and as a leader;
- onboarding and candidate gates;
- Phase 212 sign-in scenarios;
- import checker: 1,149 names, 0 problems.

## Files
- `app/js/core/router.js` (isPublicHash)
- `app/js/app.js` (return-to, sign-out handler)
- `app/js/pages/login.js`
- `app/js/core/db.js` (v85.0)
- `app/sw.js` (wdos-v85.0)
- `app/index.html`
