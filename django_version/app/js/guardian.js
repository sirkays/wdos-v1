/* Tracker-safe deep links: email links carry ?tk= in the REAL query
   (fragments die inside click-trackers). Translate before boot. */
(function () {
  try {
    if (location.search && /[?&]tk=/.test(location.search)) {
      var tk = new URLSearchParams(location.search).get('tk');
      if (tk) {
        location.replace('/#/reset?tk=' + encodeURIComponent(tk));
      }
    }
  } catch (e) { /* boot normally */ }
})();

/* WDOS boot guardian v2 — external (CSP-legal). Before anything else:
   if this browser carries a service worker or caches from a DIFFERENT
   build, purge them and reload once. No buttons, no rituals. */
(function () {
  var BUILD = 'wdos-v53.1';
  try {
    var done = localStorage.getItem('wdos.purged.for') === BUILD;
    if (!done && 'serviceWorker' in navigator) {
      localStorage.setItem('wdos.purged.for', BUILD);
      Promise.all([
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }).catch(function () {}),
        (window.caches ? caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }) : Promise.resolve()).catch(function () {}),
      ]).then(function () { location.reload(); });
      return;
    }
  } catch (e) { /* continue to boot */ }
})();

// Boot guardian: capture the first real error; if the app has not
    // painted, repair it (Phase 219) or explain why.
    window.__wdosErr = '';
    // An error that means the app's own files did not fit together (a mixed or
    // half-downloaded build) or could not be fetched. Reloading the same cache
    // cannot fix these; clearing the offline copy and loading fresh does.
    var BUILD_BROKEN = /does not provide an export|SyntaxError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token|module script/i;
    function wdosPainted() {
      try {
        var app0 = document.getElementById('app');
        if (!app0) return false;
        var onlySpinner = app0.children.length === 1 && app0.firstElementChild.getAttribute('aria-busy') === 'true';
        return window.__wdosReady === true || (app0.children.length > 0 && !onlySpinner);
      } catch (eP) { return false; }
    }
    // Clear the offline copy (service worker + caches, NOT the sign-in) and
    // load fresh. Once per 2 minutes per tab, so it can never become a loop;
    // if it already ran, the explanation screen shows instead.
    window.__wdosAutoRepair = function (reason) {
      try {
        var last = Number(sessionStorage.getItem('wdos.autorepair.at') || 0);
        if (Date.now() - last < 120000) return false;
        sessionStorage.setItem('wdos.autorepair.at', String(Date.now()));
        localStorage.setItem('wdos.autorepair.last', JSON.stringify({ at: new Date().toISOString(), reason: String(reason || '').slice(0, 240) }));
      } catch (eS) { return false; }
      var el0 = document.getElementById('app');
      if (el0) el0.innerHTML = '<div class="state" aria-busy="true"><div class="spinner"></div><p style="color:#666;font-size:14px;margin-top:10px;">Updating WDOS to the latest version…</p></div>';
      var jobs = [];
      try { if ('serviceWorker' in navigator) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }).catch(function () {})); } catch (eR) {}
      try { if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).catch(function () {})); } catch (eC) {}
      Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
      return true;
    };
    // Phase 220: before clearing anything, ask the SERVER whether the app's
    // start-up files are there. On 3 Oct only the 23 update-pack files were
    // uploaded: clearing this device's copy could not help, and the old label
    // ("module script failed") hid the real cause.
    var CRITICAL = ['/js/app.js', '/js/core/db.js', '/js/core/i18n.js', '/js/core/router.js', '/assets/vendor/supabase.js', '/locales/en.json', '/assets/css/wdos.css'];
    function probeCritical(extra, cb) {
      if (navigator.onLine === false) { cb('offline', []); return; }
      var list = CRITICAL.slice();
      if (extra && list.indexOf(extra) < 0) list.push(extra);
      var missing = []; var offline = 0; var left = list.length;
      list.forEach(function (p) {
        fetch(p + (p.indexOf('?') >= 0 ? '&' : '?') + '__probe=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) { if (r.status === 404) missing.push(p); }, function () { offline += 1; })
          .then(function () { left -= 1; if (left === 0) cb(missing.length ? 'missing' : (offline === list.length ? 'offline' : 'ok'), missing); });
      });
    }
    function plainScreen(title, html, button) {
      var el = document.getElementById('app');
      if (!el) return;
      el.innerHTML = '<div style="max-width:560px;margin:14vh auto;padding:24px;font-family:system-ui,sans-serif;">'
        + '<h3 style="margin:0 0 8px;">' + title + '</h3>' + html
        + '<button id="wdosTryAgain" style="margin-top:14px;padding:12px 18px;background:#d4006a;color:#fff;border:0;border-radius:10px;font-size:15px;">' + (button || 'Try again') + '</button></div>';
      document.getElementById('wdosTryAgain').onclick = function () { location.reload(); };
    }
    function missingScreen(files) {
      window.__wdosMissing = files;
      plainScreen('WDOS is missing some of its files',
        '<p style="color:#444;font-size:15px;line-height:1.5;">The website could not find '
        + files.map(function (f) { return '<code>' + f.replace(/</g, '&lt;') + '</code>'; }).join(', ')
        + '. This happens when an update is uploaded without the rest of the app folder. Nothing on this device needs fixing.</p>'
        + '<p style="color:#666;font-size:14px;line-height:1.5;">For the WDOS administrator: upload the <b>complete</b> "app" folder to Netlify again (the full folder, not only the update files), then press Try again.</p>');
    }
    function offlineScreen() {
      plainScreen('No connection', '<p style="color:#444;font-size:15px;">WDOS could not reach the internet. It will open when the connection returns.</p>');
    }
    // Decide: files missing on the server -> say so; offline -> say so;
    // otherwise this device's copy is stale or mixed -> repair it once.
    function diagnose(reason, url) {
      if (window.__wdosDiagnosing) return;
      window.__wdosDiagnosing = true;
      var path = '';
      try { if (url) { var U = new URL(url, location.href); if (U.origin === location.origin) path = U.pathname; } } catch (eU) {}
      probeCritical(path, function (state, missing) {
        window.__wdosDiagnosing = false;
        if (wdosPainted()) return;
        if (state === 'missing') { missingScreen(missing); return; }
        if (state === 'offline') { offlineScreen(); return; }
        if (!window.__wdosAutoRepair(reason)) { window.__wdosNeedScreen = true; wdosRescue(false); }   // already repaired once: explain instead
      });
    }
    var BOOT_URL = /(https?:\/\/[^\s'")]+)/;
    function onBootError(msg, url) {
      if (!window.__wdosErr) window.__wdosErr = msg;
      if (!BUILD_BROKEN.test(msg)) return;
      // give a healthy start a moment to paint, then diagnose
      setTimeout(function () { if (!wdosPainted()) diagnose('boot: ' + msg, url || ((msg.match(BOOT_URL) || [])[1])); }, 1200);
    }
    window.addEventListener('error', function (e) {
      var t = e && e.target;
      if (t && t !== window && (t.tagName === 'SCRIPT')) { onBootError('Could not load ' + (t.src || 'a script') + ' (module script failed)', t.src); return; }
      onBootError(String(e.message || e.error || ''));
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      onBootError(String((e.reason && e.reason.message) || e.reason || ''));
    });
    // A new build activated while this page could not start: the app's own
    // listener never ran, so reload from here (once per build).
    try {
      if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (ev) {
        var d = ev.data || {};
        if (d.type !== 'wdos:new-build' || wdosPainted()) return;
        try { if (sessionStorage.getItem('wdos.guard.reloaded') === d.version) return; sessionStorage.setItem('wdos.guard.reloaded', d.version); } catch (eG) {}
        setTimeout(function () { location.reload(); }, 300);
      });
    } catch (eM) {}
    function wdosRescue(needErr) {
      if (needErr && !window.__wdosErr) return;
      if (wdosPainted()) return;
      // Phase 220: missing files or no connection get their own plain screen;
      // otherwise try the automatic repair once; this screen is the fallback.
      if (window.__wdosMissing || window.__wdosDiagnosing) return;
      if (!window.__wdosNeedScreen) {
        window.__wdosNeedScreen = true;
        diagnose(needErr ? 'rescue: ' + window.__wdosErr : 'rescue: no paint after 20 s');
        return;
      }
      var el = document.getElementById('app');
      if (!el) return;
      el.innerHTML =
        '<div style="max-width:520px;margin:14vh auto;padding:24px;'
        + 'font-family:system-ui,sans-serif;">'
        + '<h3 style="margin:0 0 8px;">WDOS did not finish loading</h3>'
        + '<p style="color:#666;font-size:14px;">'
        + (window.__wdosErr
            ? 'Captured error: ' + window.__wdosErr.replace(/</g, '&lt;')
            : 'No error was thrown; something is stuck. '
              + 'Repair clears stored state and caches, then reloads.')
        + '</p>'
        + '<button id="wdosRepair" style="margin-top:12px;padding:12px 18px;'
        + 'background:#d4006a;color:#fff;border:0;border-radius:10px;'
        + 'font-size:15px;">Repair and restart</button></div>';
      document.getElementById('wdosRepair').onclick = async function () {
        try { localStorage.removeItem('wdos.locale'); } catch (e2) {}
        try { sessionStorage.removeItem('wdos.autorepair.at'); } catch (e5) {}
        try {
          var regs = await navigator.serviceWorker.getRegistrations();
          for (var i = 0; i < regs.length; i++) await regs[i].unregister();
        } catch (e3) {}
        try {
          var keys = await caches.keys();
          for (var j = 0; j < keys.length; j++) await caches.delete(keys[j]);
        } catch (e4) {}
        location.replace('/');
      };
    }
    setTimeout(function () { wdosRescue(true); }, 6000);
    setTimeout(function () { wdosRescue(false); }, 20000);
