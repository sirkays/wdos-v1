# PHASE 219 - Endless loading after the v85.3 deploy
Build v85.4 · db 171 (no database change) · 3 Oct 2026. To deploy: extract `wdos-v85.4-update.zip` over your `app` folder (replace files), then drag `app` to both Netlify sites.

## What the recording showed (05:54, 3 Oct)
- **The screen:** woddicrm.org showed the v85.3 badge and only the spinner. No screen was drawn in the 6 seconds recorded.
- **Server logs (WODDI HQ super admin account):**
  - **05:53:27 to 05:53:33:** the same browser loaded the dashboard normally. Its profile request had no `lga` column, so the browser was still running the previous build's code from its offline copy.
  - **During that visit:** the v85.3 service worker installed in the background, took over, and told the page to reload.
  - **The reload:** no request reached Supabase at all, through to now. The app's own code never started.

## Cause (a design flaw in my service worker, Phase 180)
The service worker downloads the whole app (277 files) when a new build appears, then serves every file from that copy for good ("cache-first").
- **How it downloaded:** it used `cache: 'reload'`. That skips the browser's own cache, but not the caches between the browser and Netlify.
- **The stale copy:** an old copy is still being served on one of those plain addresses today. `https://woddicrm.org/sw.js` was answered with **v84.9**, while the same file with a cache-busting query is v85.3.
- **The mixed set:** if the install runs while any of those caches still hands out an older copy, typically seconds after a deploy, the set it stores is mixed. Example: new `reports.js` imports `activationPassedExport`, but the stored `db.js` is old and has no such function.
- **The failure:** one missing function stops the whole app from loading ("SyntaxError: The requested module '../core/db.js' does not provide an export named ...").
- **Why it never cleared:** cache-first serves the same broken set on every reload. The old rescue screen waited 8 seconds and then needed a click.

**Reproduced** in a real browser with service workers on:
- v85.2 to v85.3 with one stale `db.js` on the plain address gives the v85.3 badge, the endless spinner, and no Supabase requests. This is the recording.
- The same upgrade with no stale copy works, which is why ordinary tests passed.

## Fix (v85.4)
1. **Cache-proof install** (`sw.js`):
   - Every file is fetched through a build-unique address (`?__b=wdos-v85.4`), which no cache on the way can answer with an old copy.
   - `index.html` must contain "WDOS build v85.4" and `db.js` must contain `APP_VERSION = '85.4'`, or the install is abandoned.
   - Each file gets 3 tries, 8 at a time. Any real failure abandons the install: the current version keeps running, and the browser tries again on the next visit. A partial or mixed set is never switched on.
2. **Cache-proof misses:** a file not in the offline copy is also fetched through the build-unique address.
3. **Self-repair** (`guardian.js`):
   - **The trigger:** an error that means the app's files do not fit together. Examples: a missing export, a module that failed to load, a script that returned an error.
   - **What it does:** the guardian waits 1.5 seconds. If nothing has drawn, it clears the offline copy (service worker and caches, not the sign-in) and reloads.
   - **No loops:** once per 2 minutes per tab. If it happens again, the explanation screen with "Repair and restart" shows instead.
   - **Other triggers:** a page still on only the spinner after 20 seconds gets the same one repair. A page that could not start also reloads itself when a new build activates.
4. **Pages that fail to open** (`router.js`): a lazily loaded page whose file does not fit the build triggers the same one-time repair, instead of a "Try again" that cannot help.

## Tests (browser, service workers ON)

| Scenario | Result |
|---|---|
| Clean upgrade v85.3 to v85.4 | One automatic reload, then v85.4 dashboard |
| Upgrade while the network serves a stale `db.js` on the plain address (this morning's case) | v85.4 installs cleanly and the dashboard opens |
| Control: the same stale network with the old v85.3 service worker | Endless spinner, exactly as recorded |
| Half-finished deploy (only `sw.js` new) | Install refused, v85.3 keeps working; once the deploy finishes, the next reload is v85.4 |
| Browser already stuck on a mixed v85.3, then v85.4 deployed | Next reload: v85.4 dashboard |
| Mixed set served at start | Error at 0.3 s, self-repair at 1.8 s, dashboard at about 7 s with no clicks |
| Server keeps sending a broken set | Exactly one self-repair, then the explanation screen; no loop |

**Regression:**
- **Pages:** Regina's pages and the leader pages, with zero errors.
- **Sign-in and onboarding:** onboarding, Google sign-in, the candidate loop, the loop breaker, the expired-token loop, and the account banner.
- **Phase 218:** the 14-Day tab, Reports downloads and the profile tab.
- **Import checker:** 0 problems.

## For anyone stuck right now on v85.3
Deploy v85.4, then reload the stuck page once (twice at most). Before that, wait about 8 seconds for "WDOS did not finish loading" and press **Repair and restart**.

## Files
- `app/sw.js`: v85.4; `APP_VERSION`/`BUILD_MARK`; `installBuild()` with `fetchFresh()`; cache-miss through `fresh()`
- `app/js/guardian.js`: self-repair
- `app/js/core/router.js`: repair on module-mismatch page errors
- `app/js/core/db.js`: `APP_VERSION` 85.4
- `app/index.html`: badge v85.4
