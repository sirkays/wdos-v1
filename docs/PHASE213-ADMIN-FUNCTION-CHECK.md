# PHASE 213 - Accounts: "admin-users function is not deployed or not reachable"
Build v84.8 · db 164 (no database change) · admin-users function v6 (ALREADY LIVE, deployed through the Supabase connector) · 29 Sep 2026. To deploy: drag `app` to both Netlify sites.

## What the screenshot showed
On Accounts (woddi.org@gmail.com, v84.7), a red-outlined banner said: "The admin-users function is not deployed or not reachable (Failed to send a request to the Edge Function)".

## What the server says
- admin-users IS deployed and active. The Supabase logs show your Accounts page's own check at 12:22:29 UTC: permission check 200, then the check itself 200 in 1.3 seconds. Every call to it today answered 200.
- Probed directly from the database: the function answers correctly, and its CORS headers are right.
- "Failed to send a request to the Edge Function" is the browser saying the request got no answer at all. It is not the function refusing. The answer was lost on the way back, or the request never left (a dropped connection).

## The actual bug
The Accounts page checked the function once on opening. If that single check got no answer, it:
1. showed "not deployed or not reachable", which was false; and
2. disabled Create login, Reset password, Change email, Suspend and Delete for the rest of the visit ("Deploy the admin-users function first"), even though the next click would have worked.

Reproduced on v84.7: losing that one answer produces exactly the screenshot's banner, and Reset password is then refused without even trying.

## What changed
- **App (`js/core/db.js`, `js/pages/accounts.js`)**:
  - Actions that are safe to repeat (the check, reset password, change email, suspend) are retried twice when the connection drops. Create, delete and the bulk runs are not retried. If their answer is lost, the message says the action may already have been done, and to refresh the list before trying again.
  - The banner now names what actually happened: no answer (a dropped connection, with the browser's own reason), function not found (a real 404), session ended, not an HQ account, or another error. It has a **Check again** button.
  - Only a function that truly does not exist blocks the buttons. Anything else, the buttons still try.
  - Lost calls are written to the sign-in diagnostics log (Doctor page).
- **admin-users v6 (live)**: the browser may now remember the function's permission check for a day. Each action becomes one request instead of two, which halves the chance of a drop on a weak connection. The allowed headers also cover what newer Supabase clients send. The function's logic is unchanged. A copy is in `supabase/functions/admin-users/index.ts`.

## Tested (real app, simulated function answers)
| Case | v84.7 | v84.8 |
|---|---|---|
| Function healthy | no banner | no banner |
| First answer lost | banner "not deployed or not reachable" (the screenshot) | retried, no banner |
| No answer three times, then Check again | not tested (no button) | accurate banner; Check again clears it |
| No answer, then Reset password | refused: "Deploy the admin-users function first" | works: temporary password shown |
| Function really missing (404) | not tested | "not found" banner, buttons blocked |

Also rerun:
- the end-to-end pages as Regina, with zero errors;
- the clock-fast sign-in and stale sign-in form scenarios from Phase 212, both still pass;
- the import checker (0 problems).

v6 was probed through the real gateway: it answered as expected, with the new headers.

## Files
- Changed:
  - `app/js/core/db.js` (invokeFn, adminUsers, v84.8)
  - `app/js/pages/accounts.js`
  - `app/locales/en.json` and `fr.json` (7 keys; acc.fnMissing reworded)
  - `app/sw.js` (wdos-v84.8)
  - `app/index.html`
  - `supabase/functions/admin-users/index.ts` (v6, live)
