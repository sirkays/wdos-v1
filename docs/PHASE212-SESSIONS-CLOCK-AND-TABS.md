# PHASE 212 - Sign-in and sessions: device clock, several windows, navigation races
Build v84.7 · db 164 (no database change) · 29 Sep 2026. To deploy: drag `app` to both Netlify sites. Nothing to run in the SQL Editor.

## What the video showed (woddi.org@gmail.com, 10:43 to 10:45 UTC)
1. On the sign-in form, Sign in went to "Signing in…" and back, twice, with the address showing `woddicrm.org/#/`.
2. After a reload, about 5 seconds of spinner, then the Command Centre.
3. Opening Activation & Readiness sent him back to the sign-in page.

## What the server logs showed
- 16 new sessions in 82 seconds: every click on Sign in DID sign in.
- Inside each session, a new token every 0.2 to 1 second, one after the other (8 to 54 in a row), then `429 over_request_rate_limit` from Supabase.
- Tokens are valid for 3600 seconds. The same pattern appears on 27 Sep (187 tokens in one session). No other account shows it.

## Root causes (three, one leading to the next)
1. **The computer's clock.** The Supabase library decides whether a token has expired with the device's clock. The logs only fit one explanation: that computer's clock runs at least 58.5 minutes ahead of real time. The usual cause is the time zone left on UTC with the time moved forward by hand so it looks right. So every brand-new token already looked expired. The library refreshed before every request, Supabase rate-limited it (429), and the library then deleted the session. That was the kick to the sign-in page, and it also doubled the start-up time.
2. **Sign in did not navigate.** After signing in, the form set the address to `#/`. When the address already said `#/`, that changed nothing, so the page was never redrawn and the button just reset. The form was sitting on `#/` because of point 3.
3. **Navigations could overtake each other.** A slower, earlier page could finish after a newer one and draw over it. That is how the sign-in form ended up on screen while the address said `#/`.

Found while testing, and fixed because it causes the same symptom for anyone:
4. **Two windows with the same sign-in logged each other out.** Phase 180 gave each window its own copy of the tokens. A second window copied the first one's refresh token, both refreshed it on their own, Supabase saw one refresh token used twice and revoked the session for both. In the test, both windows were thrown out within 4 minutes (with tokens shortened to 2 minutes; with real 1-hour tokens, within an hour or two).
5. **A device clock that is slow** had the opposite effect: expired tokens were still used, and the database silently refused the requests (75 refused requests in 4 minutes in the test).

## What changed (v84.7)
- **Sessions no longer depend on the device clock** (`js/core/db.js`). Each time a new token arrives, WDOS measures how far the device clock is from Supabase's, using the token's own "issued at" stamp. The token's expiry is then presented to the library in device-clock terms, so every expiry decision is correct whatever the device says. The difference is kept, so the next visit is right from its first request. Someone already signed in on the old build makes exactly one refresh, to learn the difference.
- **One stored token per sign-in, shared by the windows that use it.** Windows with the same sign-in share one "slot", so a refresh in one is seen by all. A different sign-in in another window keeps its own slot, so "Regina in one window, HQ in another" still works. A new window opens on the most recent sign-in, as before. A window whose session ends stays signed out: it never silently becomes whoever signed in elsewhere. Old stored sessions are moved over automatically.
- **Rate limits and storms keep the session.** A refresh answered 429, or more than six refreshes in a minute, pauses refreshing for 30 seconds. It is reported to the library as a temporary network problem, which keeps the session instead of deleting it.
- **`getSession()` never throws.** On a temporary failure it keeps the stored session. It returns "signed out" only when the server has really ended the session.
- **Phase 170 "session backup and silent recovery" retired.** It could revive another window's tokens and get the session revoked. Its stored copy of the tokens is deleted on first load.
- **Router** (`js/core/router.js`):
  - Each navigation gets a number, and a late one is discarded.
  - Each page draws into its own fresh outlet, so a late page cannot paint over the current one.
  - A page or check that fails shows "This page could not open" with Try again, instead of a half-drawn screen.
  - New `navigate()` draws the route even when the address already shows it.
- **Sign in** (`js/pages/login.js`):
  - Always moves on after signing in.
  - If the session had ended while the person was on a page (for example Activation), they are taken back to that page.
- **Faster start** (`js/app.js`):
  - The signed-in context (profile, HQ or volunteer, HQ function, modules, candidate and onboarding gates) loads in one parallel round instead of five to seven requests one after another.
  - It is kept per window for 30 minutes. A reload draws at once from that copy, while a fresh copy loads in the background; the page is redrawn only if something changed.
  - It is tied to the person: a different sign-in starts afresh.
- **Auth events** run after the library has finished its own work (calling it from inside its callback can deadlock it).
- **Doctor page** (`#/doctor`) shows the device clock difference.

## Tested (Playwright, real app, simulated Supabase auth)
The simulation behaves like Supabase: refresh tokens rotate, there is a 10-second reuse window, reusing an old refresh token revokes the session, and a burst of refreshes gets 429. Every request has network delay. The device clock can be set fast or slow.

| Scenario | v84.6 | v84.7 |
|---|---|---|
| Clock 1 hour fast: sign in, open Activation | 8 refreshes, 429, signed out, sent to sign-in (same as the logs) | 0 refreshes, stays on Activation |
| Sign-in form while the address is `#/` | stays on the form (same as the video) | opens the dashboard |
| Two windows, same sign-in (2-minute tokens, 4 minutes) | session revoked, both windows sent to sign-in | both stay signed in, 17 refreshes, no reuse |
| Two windows, two different people, plus a third new window | not tested | each keeps its own person; the new window opens on the latest sign-in |
| Clock 1 hour slow (2.5-minute tokens, 4 minutes of use) | 0 refreshes, 75 requests refused as expired | 4 refreshes on time, 0 refused |
| Clock 1 hour fast (2.5-minute tokens, 4 minutes of use) | not tested | 7 refreshes on time, no 429, no sign-out |
| Refresh answered 429 for 60 s (correct clock) | session kept | session kept; refreshing resumes when the limit lifts |
| Forced storm (9 refreshes in a row) | not tested | server sees 6, then paused; still signed in |
| Session ended by the server while on Activation | stayed on the page with a dead session for 3+ minutes | sent to sign-in; after signing in, back on Activation |
| Signed in on the old build (clock fast), opens v84.7 | not tested | 1 refresh to learn the clock; old storage moved; stays on Activation |
| Reload, 250 ms per request | shell after about 1,500 ms | shell after about 480 ms |

Also rerun:
- the end-to-end pages as Regina (home, Operations Centre, leaders, report generation, Activation, Mailboxes) and as a volunteer leader (home, `#/ops` refused), all with zero errors;
- the onboarding gate (a leader without the Pack goes to onboarding) and the candidate gate (to Activation);
- the rescue screen (still fires on a broken build, not on a normal start);
- the import checker (1,139 names, 90 modules, 0 problems).

## For Azeez's computer
WDOS no longer needs it, but other sites (Google sign-in, secure websites) can misbehave with a wrong clock. Open time.is: it shows how far off the clock is. In Windows, go to Settings > Time & language > Date & time. Turn on "Set time automatically", and either turn on "Set time zone automatically" or choose "(UTC+01:00) West Central Africa".

## Files
- Changed:
  - `app/js/core/db.js` (session layer, clock correction, slots, refresh guard, `getSession`, `onAuthChange`, v84.7; Phase 170 backup removed)
  - `app/js/core/router.js`
  - `app/js/app.js`
  - `app/js/pages/login.js`
  - `app/js/pages/doctor.js`
  - `app/sw.js` (wdos-v84.7)
  - `app/index.html` (badge)
  - `app/locales/en.json` and `fr.json` (4 keys)
- No migration; database unchanged (164).
