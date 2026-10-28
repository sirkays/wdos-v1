# PHASE 191 - Dashboards reloading on their own
Build v82.2 · db 145 · 16 Sep 2026 (app only, no SQL)

Azeez: Chukwuemeka's page, and other volunteer leaders' dashboards, keep
reloading.

## Cause
Two of my own changes, harmless alone, combined badly:
- Phase 170 made the service worker force-navigate EVERY open window each
  time a new build activated (so stale clients would stop refreshing tokens
  with old code).
- Phase 180 made the page ask the browser to check for a new build every
  time the tab came back into view.
With several windows or a pinned app open, or a slow connection where the
install finished after the page had already loaded, the activate step could
fire again on the newly loaded window, which navigated it again, and so on.
The result was exactly what leaders saw: the dashboard reloading by itself.

## Fix
- The service worker never navigates windows any more. On activation it
  sends each open window one message: new build, this version.
- The page reloads itself at most ONCE per build, remembered per window
  (sessionStorage 'wdos.reloaded.for'). No combination of tabs, pinned apps
  or update checks can make it reload twice for the same build.
- The update check on every tab focus is removed. The browser still checks
  for a new sw.js on every navigation, which is enough for a deploy to be
  picked up within one page change.
- Also: #/me/:tab now goes through the same redirect as #/me (the old page
  was still reachable by that route).

## Deploy
Drag `app` (v82.2) to both sites -> hard refresh -> "build v82.2 · db 145".
The first load after this deploy may reload once (that is the one-time
reload doing its job). It must not reload again after that.

## If it still happens
Send the "Why was I signed out?" panel text from the sign-in page, or the
browser console (F12 -> Console) from an affected leader. That will show
which code path is triggering it.
