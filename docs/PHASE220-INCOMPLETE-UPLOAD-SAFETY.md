# PHASE 220 - v85.4 upload was incomplete; WDOS now protects itself from that
Build v85.5 · db 171 (no database change) · 3 Oct 2026.

## What the screenshot showed (08:06)
- **The screen:** "WDOS did not finish loading. Captured error: Importing a module script failed: https://woddicrm.org/assets/vendor/supabase.js". Badge v85.4.
- **The live site, checked file by file:**
  - files in the update pack load (for example `js/core/passedexport.js`);
  - files that are not in the pack return **404**: `assets/vendor/supabase.js`, `js/core/i18n.js`, `js/pages/members-list.js`, `assets/woddi-logo.png`.
- **So:** the v85.4 upload contained only the 23 update-pack files, not the whole app folder. Most likely the pack was extracted into a new folder and that `app` folder was dragged to Netlify. Until a complete app folder is uploaded, the site cannot load for anyone.

## My part
1. **The v85.4 service worker accepted the incomplete upload.** I had told it to skip a file that returned 404 ("not in this deploy"), so it switched every visitor's offline copy over to a set with most files missing.
2. **The guardian mislabelled the cause.** It called it a "module script" failure and cleared the device's offline copy, which cannot help when the server itself is missing the files.

## Fix (v85.5)
1. **`sw.js`:** every file in the build list must exist. A 404 now aborts the install, so people who already have a working version keep it and never see a broken upload. Probe requests (`?__probe=`) always go to the server.
2. **`guardian.js`:** when the app cannot start, it first asks the server for the start-up files (`app.js`, `db.js`, `i18n.js`, `router.js`, `supabase.js`, `en.json`, `wdos.css`):
   - **Files missing:** a plain screen, "WDOS is missing some of its files", names them and tells the administrator to upload the complete app folder. Nothing is cleared.
   - **No connection:** "No connection". The offline copy is kept.
   - **Server fine:** the device copy is stale or mixed, so it is repaired once (the Phase 219 behaviour). If it fails again, the explanation screen shows.

## Tests (browser, service workers on)

| Scenario | Result |
|---|---|
| Existing user on v85.3, then a pack-only v85.5 upload | Install refused; stays on v85.3 and keeps working |
| First-time visitor, pack-only upload | "WDOS is missing some of its files" (i18n.js, supabase.js, …) within 2 s; no repair, no loop |
| Clean upgrade v85.3 to v85.5 | v85.5 dashboard |
| Stale copy of `db.js` on the plain address | v85.5 installs cleanly |
| Mixed set, server fixed | Self-repair, dashboard at about 4 s |
| Mixed set, server still broken | One repair, then the explanation screen; no loop |

**Regression:** all pages as Regina and as a leader with zero errors; onboarding, Google sign-in, the candidate loop, the loop breaker, the expired-token loop, the account banner, the Phase 218 downloads and profile tab; import checker 0 problems.

## Deploying (from v85.5): one complete app, no more update packs
The v85.5 upload at 08:30 was also pack-only (the new screen named `supabase.js` and `i18n.js`). Update packs depend on being extracted into the right folder, which is easy to get wrong.
- **What you get now:** `wdos-v85.5-app.zip` (6 MB) is the whole website. Extract it anywhere and drag the `app` folder inside it.
- **Why it is small:** it leaves out only `content/founder-message.mp4` (17.5 MB). That video was used by Day 1 of the retired 14-day journey and nothing else; it is still in the full archive.

**Tested (service workers on):**
- a first-time visitor gets the dashboard;
- a v85.3 user upgrades to v85.5;
- a browser that took the broken v85.4 pack-only upload (which shows exactly the 08:06 screenshot) opens v85.5 after one reload.

## Files
- `app/sw.js`: v85.5; a 404 aborts the install; `__probe` passes through
- `app/js/guardian.js`: `probeCritical`, `diagnose`, the missing-files and no-connection screens
- `app/js/core/db.js`: `APP_VERSION` 85.5
- `app/index.html`: badge v85.5

## v85.6: why the complete upload failed at "Initializing" (09:06)
- **What happened:** the restored v84.9 deploy works. The 09:06 upload of the complete v85.5 app showed "Deploy failed: Build from drop deployment", with Initializing **Failed** and Deploying **Skipped**.
- **What changed at Netlify:** Netlify Drop now **builds** a dropped folder when you are signed in. Its Drop quickstart says "Netlify will detect your framework and run the build for you before publishing".
- **The leftover file:** the app folder carried a leftover copy of the project-root `netlify.toml` with `[build] publish = "app"`. Read inside the dropped `app` folder, that points at `app/app`, which does not exist.
- **Why the 23-file uploads still published:** they had no `netlify.toml`, so they went up as-is (incomplete).
- **Why v84.9 deployed:** it went up before the change.
- **Fix:** `app/netlify.toml` is removed from the uploaded folder (kept as `docs/archive/app-netlify.toml.removed-v85.6`). The project-root `netlify.toml` stays for Git-based deploys.
- **Effect on the live site:** manual drops have always used `_redirects`/`_headers`, not `netlify.toml`. The plain 404s seen this morning, despite its "everything to index.html" rule, are consistent with that, so removing it should not change how the live site behaves.
- **Follow-up:** the security headers in that file (CSP, Permissions-Policy) were therefore probably never active. Add them as `_headers` only after testing every feature against them.
- **Tested:** the live v84.9 upgrades to v85.6 cleanly, a first-time visitor gets the dashboard, and the page regression and import checker are clean.

## v85.7: the 09:18 upload failed with "Build script returned non-zero exit code: 2"
- **What the deploy list shows:**
  - 08:57 and 09:06 failed with "Deploy directory 'app' does not exist". That was the leftover `netlify.toml`, fixed in v85.6.
  - 09:18 (v85.6) got past that, but Netlify then ran a build that failed.
  - The 08:31 23-file upload had been published in 4 s with no build.
- **Cause:** Netlify Drop now detects frameworks. Its detection code treats a root **`config.json`** as a **Hugo** site (Hugo config files: `config.json`, `config.toml`, `config.yaml`, `hugo.toml`) and runs `hugo`, which fails on WDOS. WDOS keeps its Supabase address in a root `config.json`; the 23-file uploads never contained it.
- **Proof:** Netlify's own `@netlify/build-info` 11.3.0, run on the folders:
  - v85.6 app gives `frameworks: ["hugo"]`, build `hugo`, publish `public`;
  - v85.7 app gives no framework and no build;
  - the 08:31 pack-only folder gives no framework and no build, matching its successful 4 s publish.
- **Fix (v85.7):**
  - `config.json` is renamed `wdos-config.json` (in `js/core/config.js`, `js/bootcheck.js`, and the service worker's build list);
  - `_redirects` answers `/config.json` with the new file (200 rewrite) for browsers still on the old build while they update.
- **Tested:**
  - the live v84.9 upgrades to v85.7;
  - a first-time visitor gets the dashboard;
  - all pages as Regina and as a leader, onboarding, the candidate loop and the Phase 218 downloads pass;
  - import checker: 0 problems.
- **Packaging gate from now on:** run Netlify's detection on the `app` folder before shipping. It must report no framework.
