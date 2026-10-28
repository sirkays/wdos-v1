# PHASE 182 - The language you pick stays picked
Build v81.0 · db 136 · 11 Sep 2026 (app only, no SQL, no function change)

Regina (11 Sep): the Benin DCR's dashboard is in French; switching to English
returns to French.

Cause (app.js route hook since Phase 60s): on EVERY page change the app
re-applied the account's preferred_locale (French for francophone leaders,
set at seating). The header switch saved the choice to the browser and tried
to save it to the account, but the account save is best-effort and silent;
when it failed, the next page change pulled the account value back. Even
when it succeeded, ctx.profile still held the old value until reload, so the
first navigation after switching flipped back.

Fix:
- i18n.js: hasLocalChoice() — true once someone picked a language in this
  browser (localStorage wdos.locale).
- app.js: the account's preferred_locale is applied only when the browser
  has no local choice. A local choice always wins from then on.
- layout.js: a failed account save is logged to the console instead of
  vanishing, so a policy problem shows up in DevTools.

Effect: pick English in the header → English stays, on every page and after
reload, for that browser. A leader's own account default still applies on a
new device until she picks a language there.

Deploy: drag `app` (v81.0) to both Netlify sites → badge "build v81.0 · db 136".
