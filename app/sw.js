/**
 * WDOS service worker — offline-first viewing.
 *
 * Strategy:
 *  - App shell (HTML): network-first, cache fallback → the app always
 *    opens, even fully offline.
 *  - Static assets (CSS/JS/locales/vendor/icons): stale-while-revalidate
 *    → instant loads, silent background refresh.
 *  - Supabase REST reads (GET /rest/v1/...): network-first with cache
 *    fallback → last-loaded data remains viewable offline.
 *  - Auth and realtime endpoints: never cached.
 *  - Writes (POST/PATCH/...): never intercepted, never cached.
 *
 * The data cache is cleared on sign-out (see app.js) so cached rows
 * never leak between accounts on a shared device.
 *
 * VERSION is bumped with every release; old caches are removed on
 * activation.
 */
const APP_VERSION = '85.8';                 // must equal APP_VERSION in js/core/db.js
const VERSION = `wdos-v${APP_VERSION}`;
const BUILD_MARK = `WDOS build v${APP_VERSION}`;   // printed in this build's index.html
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = 'wdos-data';   // stable name: app.js deletes it on sign-out

// Phase 180: the WHOLE app is precached at install (generated list, one entry per file)
// so pages open from disk; VERSION bumps per release so a deploy = a new, complete set.
const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/wdos-config.json',
  '/assets/africa-map-names.json',
  '/assets/africa-map.svg',
  '/assets/css/wdos.css',
  '/assets/favicon.svg',
  '/assets/flags/ao.svg',
  '/assets/flags/bf.svg',
  '/assets/flags/bi.svg',
  '/assets/flags/bj.svg',
  '/assets/flags/bw.svg',
  '/assets/flags/cd.svg',
  '/assets/flags/cf.svg',
  '/assets/flags/cg.svg',
  '/assets/flags/ci.svg',
  '/assets/flags/cm.svg',
  '/assets/flags/countries.json',
  '/assets/flags/cv.svg',
  '/assets/flags/dj.svg',
  '/assets/flags/dz.svg',
  '/assets/flags/eg.svg',
  '/assets/flags/er.svg',
  '/assets/flags/et.svg',
  '/assets/flags/ga.svg',
  '/assets/flags/gh.svg',
  '/assets/flags/gm.svg',
  '/assets/flags/gn.svg',
  '/assets/flags/gq.svg',
  '/assets/flags/gw.svg',
  '/assets/flags/ke.svg',
  '/assets/flags/km.svg',
  '/assets/flags/lr.svg',
  '/assets/flags/ls.svg',
  '/assets/flags/ly.svg',
  '/assets/flags/ma.svg',
  '/assets/flags/mg.svg',
  '/assets/flags/ml.svg',
  '/assets/flags/mr.svg',
  '/assets/flags/mu.svg',
  '/assets/flags/mw.svg',
  '/assets/flags/mz.svg',
  '/assets/flags/na.svg',
  '/assets/flags/ne.svg',
  '/assets/flags/ng.svg',
  '/assets/flags/rw.svg',
  '/assets/flags/sc.svg',
  '/assets/flags/sd.svg',
  '/assets/flags/sl.svg',
  '/assets/flags/sn.svg',
  '/assets/flags/so.svg',
  '/assets/flags/ss.svg',
  '/assets/flags/st.svg',
  '/assets/flags/sz.svg',
  '/assets/flags/td.svg',
  '/assets/flags/tg.svg',
  '/assets/flags/tn.svg',
  '/assets/flags/tz.svg',
  '/assets/flags/ug.svg',
  '/assets/flags/za.svg',
  '/assets/flags/zm.svg',
  '/assets/flags/zw.svg',
  '/assets/fonts/inter-latin-wght-normal.woff2',
  '/assets/fonts/inter-latin-ext-wght-normal.woff2',
  '/vendor/fontawesome/css/fontawesome.min.css',
  '/vendor/fontawesome/css/solid.min.css',
  '/vendor/fontawesome/css/regular.min.css',
  '/vendor/fontawesome/css/brands.min.css',
  '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  '/assets/hq-sidebars.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/leader-photos.json',
  '/assets/reset-list.json',
  '/content/leadership-manual.html',
  '/content/code-of-conduct.html',
  '/content/volunteer-agreement.html',
  '/assets/hq-messages/wi001-wgmn.svg',
  '/assets/hq-messages/wi001-wnnn.svg',
  '/assets/hq-messages/wi002-wgmn.svg',
  '/assets/hq-messages/wi002-wnnn.svg',
  '/assets/hq-messages/wi003-wgmn.svg',
  '/assets/hq-messages/wi003-wnnn.svg',
  '/assets/hq-messages/wi004-wgmn.svg',
  '/assets/hq-messages/wi004-wnnn.svg',
  '/assets/hq-messages/wi005-wgmn.svg',
  '/assets/hq-messages/wi005-wnnn.svg',
  '/assets/hq-messages/wi006-wgmn.svg',
  '/assets/hq-messages/wi006-wnnn.svg',
  '/assets/hq-messages/wi007-wgmn.svg',
  '/assets/hq-messages/wi007-wnnn.svg',
  '/assets/hq-messages/wi008-wgmn.svg',
  '/assets/hq-messages/wi008-wnnn.svg',
  '/assets/hq-messages/wi009-wgmn.svg',
  '/assets/hq-messages/wi009-wnnn.svg',
  '/assets/hq-messages/wi010-wgmn.svg',
  '/assets/hq-messages/wi010-wnnn.svg',
  '/assets/hq-messages/wi011-wgmn.svg',
  '/assets/hq-messages/wi011-wnnn.svg',
  '/assets/hq-messages/wi012-wgmn.svg',
  '/assets/hq-messages/wi012-wnnn.svg',
  '/assets/hq-messages/wi013-wgmn.svg',
  '/assets/hq-messages/wi013-wnnn.svg',
  '/assets/monthly/mli-y1-m01.svg',
  '/assets/monthly/mli-y1-m02.svg',
  '/assets/monthly/mli-y1-m03.svg',
  '/assets/monthly/mli-y1-m04.svg',
  '/assets/monthly/mli-y1-m05.svg',
  '/assets/monthly/mli-y1-m06.svg',
  '/assets/monthly/mli-y1-m07.svg',
  '/assets/monthly/mli-y1-m08.svg',
  '/assets/monthly/mli-y1-m09.svg',
  '/assets/monthly/mli-y1-m10.svg',
  '/assets/monthly/mli-y1-m11.svg',
  '/assets/monthly/mli-y1-m12.svg',
  '/assets/monthly/mli-y2-m01.svg',
  '/assets/monthly/mli-y2-m02.svg',
  '/assets/monthly/mli-y2-m03.svg',
  '/assets/monthly/mli-y2-m04.svg',
  '/assets/monthly/mli-y2-m05.svg',
  '/assets/monthly/mli-y2-m06.svg',
  '/assets/monthly/mli-y2-m07.svg',
  '/assets/monthly/mli-y2-m08.svg',
  '/assets/monthly/mli-y2-m09.svg',
  '/assets/monthly/mli-y2-m10.svg',
  '/assets/monthly/mli-y2-m11.svg',
  '/assets/monthly/mli-y2-m12.svg',
  '/assets/monthly/mli-y3-m01.svg',
  '/assets/monthly/mli-y3-m02.svg',
  '/assets/monthly/mli-y3-m03.svg',
  '/assets/monthly/mli-y3-m04.svg',
  '/assets/monthly/mli-y3-m05.svg',
  '/assets/monthly/mli-y3-m06.svg',
  '/assets/monthly/mli-y3-m07.svg',
  '/assets/monthly/mli-y3-m08.svg',
  '/assets/monthly/mli-y3-m09.svg',
  '/assets/monthly/mli-y3-m10.svg',
  '/assets/monthly/mli-y3-m11.svg',
  '/assets/monthly/mli-y3-m12.svg',
  '/assets/monthly/mli-y4-m01.svg',
  '/assets/monthly/mli-y4-m02.svg',
  '/assets/monthly/mli-y4-m03.svg',
  '/assets/monthly/mli-y4-m04.svg',
  '/assets/monthly/mli-y4-m05.svg',
  '/assets/monthly/mli-y4-m06.svg',
  '/assets/monthly/mli-y4-m07.svg',
  '/assets/monthly/mli-y4-m08.svg',
  '/assets/monthly/mli-y4-m09.svg',
  '/assets/monthly/mli-y4-m10.svg',
  '/assets/monthly/mli-y4-m11.svg',
  '/assets/monthly/mli-y4-m12.svg',
  '/assets/monthly/mli-y5-m01.svg',
  '/assets/monthly/mli-y5-m02.svg',
  '/assets/monthly/mli-y5-m03.svg',
  '/assets/monthly/mli-y5-m04.svg',
  '/assets/monthly/mli-y5-m05.svg',
  '/assets/monthly/mli-y5-m06.svg',
  '/assets/monthly/mli-y5-m07.svg',
  '/assets/monthly/mli-y5-m08.svg',
  '/assets/monthly/mli-y5-m09.svg',
  '/assets/monthly/mli-y5-m10.svg',
  '/assets/monthly/mli-y5-m11.svg',
  '/assets/monthly/mli-y5-m12.svg',
  '/assets/messages/calm.svg',
  '/assets/messages/celebration.svg',
  '/assets/messages/courage.svg',
  '/assets/messages/gratitude.svg',
  '/assets/messages/growth.svg',
  '/assets/messages/purpose.svg',
  '/assets/logos/wgmn.png',
  '/assets/logos/wgmn-wordmark.png',
  '/assets/logos/wgmn-disc.png',
  '/assets/logos/wnnn-disc.png',
  '/assets/logos/woddi-nurturer-wordmark.png',
  '/assets/logos/wnnn.png',
  '/assets/vendor/supabase.js',
  '/assets/wgmn-logo.png',
  '/assets/woddi-logo.png',
  '/assets/woddi-nurturer.png',
  '/js/app.js',
  '/js/bootcheck.js',
  '/js/components/charts.js',
  '/js/components/courses.js',
  '/js/components/icons.js',
  '/js/components/journey.js',
  '/js/components/layout.js',
  '/js/components/mobileshell.js',
  '/js/components/modal.js',
  '/js/components/notify.js',
  '/js/components/search.js',
  '/js/components/toast.js',
  '/js/components/vshell.js',
  '/js/core/activationexport.js',
  '/js/core/passedexport.js',
  '/js/core/ai.js',
  '/js/core/config.js',
  '/js/core/db.js',
  '/js/core/dom.js',
  '/js/core/geo.js',
  '/js/core/homecache.js',
  '/js/core/i18n.js',
  '/js/core/lingua.js',
  '/js/core/notifybrowser.js',
  '/js/core/photos.js',
  '/js/core/push.js',
  '/js/core/router.js',
  '/js/core/obvisit.js',
  '/js/core/plainerror.js',
  '/js/core/rtc.js',
  '/js/core/titles.js',
  '/js/core/ttsprobe.js',
  '/js/guardian.js',
  '/js/pages/accounts.js',
  '/js/pages/announcements.js',
  '/js/pages/apply.js',
  '/js/pages/ask.js',
  '/js/pages/cases.js',
  '/js/pages/central.js',
  '/js/pages/claim.js',
  '/js/pages/command.js',
  '/js/pages/content.js',
  '/js/pages/country.js',
  '/js/pages/countryhq.js',
  '/js/pages/dashboard.js',
  '/js/pages/doctor.js',
  '/js/pages/documents.js',
  '/js/pages/engagement.js',
  '/js/pages/helpdesk.js',
  '/js/pages/hofco.js',
  '/js/pages/home.js',
  '/js/pages/hq.js',
  '/js/pages/idstart.js',
  '/js/pages/interpret.js',
  '/js/pages/leaders.js',
  '/js/pages/leadership.js',
  '/js/pages/library.js',
  '/js/pages/login.js',
  '/js/pages/me.js',
  '/js/pages/meetings.js',
  '/js/pages/member-detail.js',
  '/js/pages/members-list.js',
  '/js/pages/messages.js',
  '/js/pages/networkhq.js',
  '/js/pages/onboarding.js',
  '/js/pages/join.js',
  '/js/pages/candidate.js',
  '/js/pages/activation.js',
  '/js/pages/hqactivation.js',
  '/js/pages/hqmailboxes.js',
  '/js/pages/ops.js',
  '/js/pages/opsreport.js',
  '/js/components/opscharts.js',
  '/js/components/mailboxcard.js',
  '/js/pages/organisation.js',
  '/js/pages/outreach.js',
  '/js/pages/planned.js',
  '/js/pages/programmes.js',
  '/js/pages/read.js',
  '/js/pages/recruitment.js',
  '/js/pages/refland.js',
  '/js/pages/reflinks.js',
  '/js/pages/reporting.js',
  '/js/pages/reports.js',
  '/js/pages/reset.js',
  '/js/pages/rolehome.js',
  '/js/pages/room.js',
  '/js/pages/settings.js',
  '/js/pages/spotlight.js',
  '/js/pages/structure.js',
  '/js/pages/tasks.js',
  '/js/pages/uat.js',
  '/js/pages/volunteer.js',
  '/locales/en.json',
  '/locales/fr.json',
];

/* Phase 219: a deploy must land as ONE build.
   The 3 Oct endless spinner: the browser installed the new worker seconds
   after a deploy, while Netlify's edge still answered some plain addresses
   with older copies. The install stored a mixed set (new pages importing
   functions an old db.js did not have), the app could not even start, and
   cache-first then served that broken set on every reload.
   Now every file is fetched through a build-unique address, which no cache
   between the browser and Netlify can answer with an old copy; index.html and
   db.js must prove they are this build; and a failed install keeps the
   current version running and tries again on the next visit. */
const fresh = (p) => fetch(new Request(`${p}${p.includes('?') ? '&' : '?'}__b=${VERSION}`,
  { cache: 'reload', credentials: 'same-origin' }));
async function fetchFresh(p, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fresh(p);
      if (res.ok) return res;
      // Phase 220: every CORE file belongs to this build. A 404 means the
      // upload was incomplete (3 Oct: only the 23 update-pack files went up),
      // so refuse the whole install and keep the working version.
      if (res.status === 404) throw new Error(`${p} is missing from this deploy`);
      last = new Error(`${p}: HTTP ${res.status}`);
    } catch (e) { if (/missing from this deploy/.test(String(e && e.message))) throw e; last = e; }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw last || new Error(`${p}: unreachable`);
}
async function installBuild() {
  const cache = await caches.open(STATIC_CACHE);
  const idx = await fetchFresh('/index.html');
  if (!idx.ok || !(await idx.clone().text()).includes(BUILD_MARK)) throw new Error(`index.html is not ${VERSION}`);
  const dbjs = await fetchFresh('/js/core/db.js');
  if (!dbjs.ok || !(await dbjs.clone().text()).includes(`APP_VERSION = '${APP_VERSION}'`)) throw new Error(`db.js is not ${VERSION}`);
  await cache.put('/index.html', idx.clone());
  await cache.put('/', idx);
  await cache.put('/js/core/db.js', dbjs);
  const rest = CORE.filter((p) => p !== '/' && p !== '/index.html' && p !== '/js/core/db.js');
  let next = 0;
  const worker = async () => {
    while (next < rest.length) {
      const p = rest[next]; next += 1;
      const res = await fetchFresh(p);
      await cache.put(p, res);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

self.addEventListener('install', (event) => {
  event.waitUntil(installBuild()
    .then(() => self.skipWaiting())
    .catch(async (err) => {
      // Never activate a partial or mixed set: drop it, stay on the current
      // version, and the browser retries this install on the next visit.
      await caches.delete(STATIC_CACHE).catch(() => {});
      throw err;
    }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k.startsWith('wdos-v') && k !== STATIC_CACHE)
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
      // Phase 191: a new build no longer force-reloads every open window. That
      // navigate() ran on EVERY activation, and combined with the update check
      // on tab focus it could reload a leader's dashboard again and again. The
      // page is told once and reloads itself at most once per build.
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((cs) => { for (const c of cs) { try { c.postMessage({ type: 'wdos:new-build', version: VERSION }); } catch { /* ignore */ } } })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;             // never touch writes

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Phase 220: guardian.js asks the SERVER whether a file exists; never
    // answer that from the offline copy.
    if (url.searchParams.has('__probe')) return;
    // Phase 180: cache-first for every same-origin file, out of the
    // version-named precache. The whole app was fetched as one set at install,
    // so nothing can mix builds (the v48 blank came from refreshing files one
    // at a time). A new release ships a new sw.js, which installs a new
    // complete set and then reloads open windows (activate handler).
    if (req.mode === 'navigate') {
      event.respondWith(cacheFirst(new Request('/index.html'), STATIC_CACHE, req));
    } else {
      event.respondWith(cacheFirst(req, STATIC_CACHE));
    }
    return;
  }

  // Supabase REST reads only; auth/realtime/storage stay network-only.
  if (url.hostname.endsWith('.supabase.co')
      && url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(networkFirst(req, DATA_CACHE));
  }
});

async function cacheFirst(req, cacheName, original) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });   // index.html asks for /js/app.js?v=…
  if (hit) return hit;
  try {
    // Phase 219: a file missing from the precache is fetched through the
    // build-unique address too, so it cannot come back as an old copy.
    const path = new URL(req.url).pathname;
    const res = await fresh(path);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (fallbackPath) {
      const fb = await cache.match(fallbackPath);
      if (fb) return fb;
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || refresh.then((res) =>
    res || new Response('', { status: 503, statusText: 'Offline' }));
}

/* ---- Web Push (Phase 88) -------------------------------------------- */
/* The push-send Edge Function delivers {title, body, url}. Show it even
   when no WDOS tab exists — that is the whole point of push. The tag
   matches notifybrowser.js's scheme so an in-tab notification and a push
   for the same target replace, not stack. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* text */ }
  const title = data.title || 'WDOS';
  const target = data.url || '#/me';
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || '').slice(0, 160),
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    tag: 'wdos-' + target,
    renotify: true,
    data: { url: target },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url)
    || '#/me';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({
      type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        try { await w.navigate('/' + target); } catch { /* SPA hash */ }
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow('/' + target);
  })());
});
