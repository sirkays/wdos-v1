/**
 * WDOS router — hash-based so it works on any static host with no
 * server rewrites and survives offline reloads.
 *
 * Route shape: { path: '#/members/:id', page: fn(params), public: bool }
 * Each page module exports render(container, params) and may export
 * teardown() for cleanup (event listeners, realtime channels).
 *
 * Phase 212: navigations can no longer overtake each other. Each one gets a
 * number; a slower, earlier navigation that finishes late is discarded, and
 * every page draws into its own fresh outlet, so a late page cannot paint
 * over the current one (that is how the sign-in form could sit on the screen
 * while the address said #/). A page that throws shows a "Try again" card
 * instead of leaving a half-drawn screen.
 */
import { t } from './i18n.js';

const routes = [];
let currentTeardown = null;
let guard = null;
let navSeq = 0;

export function registerRoute(path, page, { isPublic = false } = {}) {
  const keys = [];
  const pattern = new RegExp(
    '^' +
    path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) +
    '$'
  );
  routes.push({ pattern, keys, page, isPublic });
}

/** guardFn(route) -> '#/somewhere' to redirect, or null to allow. */
export function setGuard(guardFn) { guard = guardFn; }

/** Go to a route. Unlike `location.hash = x`, this also works when the
 *  address already shows x: the route is drawn again. */
export function navigate(hash) {
  const here = location.hash || '#/';
  if (here === hash) return resolve();
  location.hash = hash;
  return undefined;
}

/** Draw the current route again (after the signed-in context changed). */
export function refresh() { return resolve(); }

/** Phase 215: true when `hash` is a public page (sign-in forms, referral
 *  forms, registration doors). Those pages manage the session themselves
 *  (some sign out on purpose), so they are never a place to "come back to"
 *  after signing in, and a sign-out on them must not move anyone. */
export function isPublicHash(hash) {
  const h = String(hash || '#/').split('?')[0];
  const m = routes.find((r) => r.pattern.test(h));
  return !!(m && m.isPublic);
}

const BUSY = '<div class="state" aria-busy="true"><div class="spinner"></div></div>';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (k, fb) => { try { const v = t(k); return v && v !== k ? v : fb; } catch { return fb; } };

function showError(node, err) {
  const msg = String(err?.message || err || 'Unknown error');
  // Phase 219: a page whose files do not fit together (an old copy of one
  // module in the offline cache) cannot be fixed by "Try again". Clear the
  // offline copy and load fresh, once (guardian.js keeps it from looping).
  if (/does not provide an export|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)
      && typeof window.__wdosAutoRepair === 'function' && window.__wdosAutoRepair('route: ' + msg)) return;
  node.innerHTML = `<div class="state"><h3>${esc(tr('route.errTitle', 'This page could not open'))}</h3>`
    + `<p class="muted">${esc(msg)}</p>`
    + `<p><button type="button" class="btn btn--primary" data-retry>${esc(tr('route.retry', 'Try again'))}</button> `
    + `<a class="btn btn--quiet" href="#/">${esc(tr('route.home', 'Home'))}</a></p></div>`;
  node.querySelector('[data-retry]')?.addEventListener('click', () => resolve());
  import('./db.js').then((m) => m.authLog('route_error', { msg: msg.slice(0, 160) })).catch(() => {});
}

/* Phase 216: loop breaker. No person moves between pages more than about ten
   times in four seconds; when the app does (two pages redirecting to each
   other), stop, say so, and let the person try again, instead of hammering
   the server until the tab is closed. */
let recent = [];
let trippedUntil = 0;
function looping() {
  const now = Date.now();
  recent = recent.filter((t) => now - t < 4000);
  recent.push(now);
  return recent.length > 10;
}

async function resolve() {
  const seq = ++navSeq;
  const stale = () => seq !== navSeq;
  if (Date.now() < trippedUntil) return undefined;      // the loop card stays until she acts (or 8 s pass)
  if (looping()) {
    recent = [];
    trippedUntil = Date.now() + 8000;
    const node = document.getElementById('app');
    node.innerHTML = `<div class="state"><h3>${esc(tr('route.loopTitle', 'WDOS stopped a page loop'))}</h3>`
      + `<p class="muted">${esc(tr('route.loopBody', 'This page kept redirecting. It is usually a dropped connection or an ended session.'))}</p>`
      + `<p><button type="button" class="btn btn--primary" data-retry>${esc(tr('route.retry', 'Try again'))}</button> `
      + `<a class="btn btn--quiet" href="#/login">${esc(tr('route.signIn', 'Sign in'))}</a></p></div>`;
    node.querySelector('[data-retry]')?.addEventListener('click', () => { recent = []; trippedUntil = 0; resolve(); });
    node.querySelector('a[href="#/login"]')?.addEventListener('click', () => { recent = []; trippedUntil = 0; if (location.hash === '#/login') resolve(); });
    import('./db.js').then((m) => m.authLog('route_loop_stopped', { at: location.hash })).catch(() => {});
    return undefined;
  }
  // Google (and any OAuth) sign-in can return three ways: tokens in
  // the fragment (#access_token=...), a PKCE code in the query
  // (?code=...), or an error fragment (#error=...). The auth library
  // consumes them a moment after load; without this guard the router
  // would read those as a page name and show "Page not found".
  const authish =
    /(^#|[#&?])(access_token|refresh_token|provider_token|error|error_code|error_description|code)=/;
  if (authish.test(location.hash) || authish.test(location.search)) {
    const outlet = document.getElementById('app');
    outlet.innerHTML =
      '<div class="state"><h3>Signing you in…</h3></div>';
    // Phase 214: tokens that arrive but do not become a session are a failed
    // sign-in too: say so on the form instead of showing it silently.
    const hadError = /(^#|[#&?])(error|error_code|error_description|access_token)=/.test(location.hash + location.search);
    const { db, hasProfile } = await import('./db.js');
    let signed = false;
    for (let i = 0; i < 40; i++) {
      try {
        const { data } = await db().auth.getSession();
        if (data?.session) { signed = true; break; }
      } catch { /* client still booting */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    // If signed in, give the profile-creation trigger a moment so the
    // dashboard does not render before the row exists.
    if (signed) {
      for (let i = 0; i < 20; i++) {
        try { if (await hasProfile()) break; } catch { /* keep waiting */ }
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (stale()) return undefined;
    history.replaceState(null, '',
      location.pathname + (signed ? '#/' : '#/login' + (hadError ? '?oauth=failed' : '')));
    return resolve();
  }

  const full = location.hash || '#/';
  const qIdx = full.indexOf('?');
  const hash = qIdx >= 0 ? full.slice(0, qIdx) : full;
  const query = qIdx >= 0
    ? Object.fromEntries(new URLSearchParams(full.slice(qIdx + 1)))
    : {};
  const match = routes
    .map((r) => ({ r, m: hash.match(r.pattern) }))
    .find((x) => x.m);

  const outlet = document.getElementById('app');
  if (!match) {
    outlet.innerHTML =
      '<div class="state"><h3>Page not found</h3>' +
      '<p><a href="#/">Go to the dashboard</a></p></div>';
    return undefined;
  }

  if (guard) {
    let redirect = null;
    try { redirect = await guard(match.r); }
    catch (err) { if (!stale()) showError(document.getElementById('app'), err); return undefined; }
    if (stale()) return undefined;
    if (redirect) {
      if (redirect === full) { showError(document.getElementById('app'), new Error('Redirect loop: ' + redirect)); return undefined; }
      navigate(redirect);
      return undefined;
    }
  }

  if (typeof currentTeardown === 'function') { try { currentTeardown(); } catch { /* page already gone */ } }
  currentTeardown = null;
  const params = {
    ...query,
    ...Object.fromEntries(
      match.r.keys.map((k, i) => [k, decodeURIComponent(match.m[i + 1])])),
  };
  // A fresh outlet for this page: an earlier page that finishes late keeps
  // writing into its own, detached outlet and never reaches the screen.
  const live = document.getElementById('app');
  const view = live.cloneNode(false);
  view.innerHTML = BUSY;
  live.replaceWith(view);
  let teardown;
  try { teardown = await match.r.page(view, params); }
  catch (err) { if (!stale()) showError(view, err); return undefined; }
  if (stale()) { if (typeof teardown === 'function') { try { teardown(); } catch { /* ok */ } } return undefined; }
  currentTeardown = teardown;
  return undefined;
}

export function startRouter() {
  window.addEventListener('hashchange', () => { resolve(); });
  return resolve();
}
