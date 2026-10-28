/**
 * WDOS bootstrap. Order matters:
 * config → i18n → db → routes → router.
 */
import { loadConfig } from './core/config.js';
import { initI18n, t, registerLocaleLoader } from './core/i18n.js';
import { initDb, getSession, getMyProfile, getMyModules, onAuthChange, authLog, wasUserSignOut, db, amIStaff, getMyRoles, myCandidateState, onboardingStatus } from './core/db.js';
import { registerRoute, setGuard, startRouter, navigate, refresh, isPublicHash } from './core/router.js';
import * as login from './pages/login.js';
import * as reset from './pages/reset.js';
import * as doctor from './pages/doctor.js';
import * as readpage from './pages/read.js';
import * as idstart from './pages/idstart.js';
import * as leadership from './pages/leadership.js';
import { initBrowserNotify } from './core/notifybrowser.js';
import * as dashboard from './pages/dashboard.js';
import * as membersList from './pages/members-list.js';
import * as memberDetail from './pages/member-detail.js';
import * as recruitment from './pages/recruitment.js';
import * as apply from './pages/apply.js';
import * as organisation from './pages/organisation.js';
import * as tasks from './pages/tasks.js';
import * as meetings from './pages/meetings.js';
import * as reports from './pages/reports.js';
import * as announcements from './pages/announcements.js';
import * as settings from './pages/settings.js';
import * as programmes from './pages/programmes.js';
import * as cases from './pages/cases.js';
import * as helpdesk from './pages/helpdesk.js';
import * as library from './pages/library.js';
import * as documents from './pages/documents.js';
import * as hq from './pages/hq.js';
import * as leaders from './pages/leaders.js';
import * as command from './pages/command.js';
import * as spotlight from './pages/spotlight.js';
import * as outreach from './pages/outreach.js';
import * as me from './pages/me.js';
import * as content from './pages/content.js';
import * as uat from './pages/uat.js';
import * as claim from './pages/claim.js';
import * as ask from './pages/ask.js';
import * as messages from './pages/messages.js';
import * as room from './pages/room.js';
import * as volunteer from './pages/volunteer.js';
import * as interpret from './pages/interpret.js';
import * as home from './pages/home.js';
import * as accounts from './pages/accounts.js';
import * as structure from './pages/structure.js';
import * as reporting from './pages/reporting.js';
import * as reflinks from './pages/reflinks.js';
import * as central from './pages/central.js';
import * as countryhq from './pages/countryhq.js';
import * as hofco from './pages/hofco.js';
import * as planned from './pages/planned.js';
import * as rolehome from './pages/rolehome.js';
import * as engagement from './pages/engagement.js';
import * as networkhq from './pages/networkhq.js';
import * as refland from './pages/refland.js';
import { setShellMode } from './components/layout.js';
import { allowedByVisit, onPageShown } from './core/obvisit.js';
import { touchLastSeen } from './core/db.js';

const ctx = { profile: null, modules: null };

/* Phase 212 — the signed-in context (profile, HQ or volunteer, HQ function,
   modules, candidate and onboarding gates) is loaded in ONE parallel round
   instead of five to seven requests one after another, and kept for this
   window for 30 minutes: a reload draws at once from that copy while a fresh
   copy is fetched in the background (the page is redrawn only if something
   changed). It is tied to the person: a different sign-in starts afresh. */
const CTX_KEY = 'wdos.ctx.v2';   // v2 (Phase 218): profile now carries lga
const CTX_MAX_AGE = 30 * 60 * 1000;
const HQ_ROLES = new Set(['super_admin', 'executive_director', 'hq_team']);
const FALLBACK_MODULES = ['tasks', 'meetings', 'announcements'];
const sidebarsReady = fetch('/assets/hq-sidebars.json', { cache: 'force-cache' })
  .then((r) => r.json()).catch(() => ({ sidebars: {} }))
  .then((j) => { window.__wdosSidebars = j; });

function resetCtx() {
  Object.assign(ctx, { uid: null, profile: null, modules: null, hq: undefined, candidate: undefined, gated: undefined, seenAt: 0, photoChecked: false, loading: null });
  window.__wdosHqFn = undefined;
  try { sessionStorage.removeItem(CTX_KEY); } catch { /* ok */ }
}
function readSnap() { try { return JSON.parse(sessionStorage.getItem(CTX_KEY) || 'null'); } catch { return null; } }
function writeSnap(c) { try { sessionStorage.setItem(CTX_KEY, JSON.stringify(c)); } catch { /* storage full */ } }
function applyCtx(c) {
  ctx.uid = c.uid; ctx.profile = c.profile; window.__wdosHqFn = c.hqFn || null;
  ctx.hq = !!c.hq; ctx.candidate = !!c.candidate; ctx.gated = !!c.gated;
  ctx.modules = new Set(c.modules || FALLBACK_MODULES);
  setShellMode(ctx.hq ? 'hq' : 'volunteer');
}
const snapKey = (c) => JSON.stringify([c.uid, c.profile, c.hqFn, !!c.hq, !!c.candidate, !!c.gated, (c.modules || []).slice().sort()]);

async function fetchContext(uid) {
  const [profile, hqFn, staff, roles, modules, cand, onboard] = await Promise.all([
    getMyProfile(),
    db().rpc('my_hq_function', {}).then((r) => r.data || null, () => null),
    amIStaff().catch(() => false),
    getMyRoles().catch(() => []),
    getMyModules().then((s) => [...s], () => null),
    myCandidateState().catch(() => null),
    onboardingStatus().catch(() => null),
  ]);
  if (!profile) return null;
  // Phase 131: HQ staff and HQ role holders keep the central dashboard;
  // every member and volunteer leader gets the Volunteer Dashboard shell.
  const hq = !!staff || (roles || []).some((r) => HQ_ROLES.has(r.role));
  // Phase 194: a CANDIDATE (in a 3-Day or 7-Day activation, holding no seat)
  // sees her activation, help, profile and settings only until HQ decides.
  let candidate = false;
  if (!hq && cand && !cand.hq && !cand.has_seat) {
    const selected = cand.activation && cand.activation.outcome === 'selected';
    candidate = !selected && (!!cand.activation || cand.status === 'applicant' || cand.status === 'under_review' || !!cand.referral_code);
  }
  // Phase 145: a seated leader who has not ticked "Read the Volunteer
  // Leadership Pack" is held to onboarding and a few safe pages.
  const gated = !hq && (roles || []).length > 0 && !!onboard
    && !(onboard.steps || []).some((x) => x.code === 'pack' && x.done_at);
  return { uid, profile, hqFn, hq, candidate, gated, modules, at: Date.now() };
}

async function ensureContext(session) {
  const uid = session.user.id;
  if (ctx.uid && ctx.uid !== uid) resetCtx();       // someone else signed in in this window
  if (ctx.uid === uid && ctx.profile) return true;
  if (!ctx.loading) {
    const snap = readSnap();
    if (snap && snap.uid === uid && snap.profile && Date.now() - snap.at < CTX_MAX_AGE && snap.at <= Date.now()) {
      applyCtx(snap);
      fetchContext(uid).then((fresh) => {
        if (ctx.uid !== uid) return;
        if (!fresh) { resetCtx(); refresh(); return; }
        writeSnap(fresh);
        if (snapKey(fresh) !== snapKey(snap)) { applyCtx(fresh); authLog('context_changed'); refresh(); }
      }).catch(() => { /* keep the copy; next navigation tries again */ });
      return true;
    }
    ctx.loading = fetchContext(uid)
      .then((c) => { if (c && (!ctx.uid || ctx.uid === uid)) { applyCtx(c); writeSnap(c); } return !!c; })
      .finally(() => { ctx.loading = null; });
  }
  return ctx.loading;
}

function rememberReturn() {
  const here = location.hash || '#/';
  if (here.startsWith('#/login') || here === '#/' || here.startsWith('#/logout')) return;
  // Phase 215: never a public page. The candidate sign-in and the referral
  // forms sign out on purpose; remembering them made the leaders' sign-in
  // send the person back there, which signed her out again (a loop).
  if (isPublicHash(here)) return;
  try { sessionStorage.setItem('wdos.returnTo', JSON.stringify({ to: here, at: Date.now() })); } catch { /* ok */ }
}
function sendToLogin(reason) {
  authLog('to_login', { reason, from: location.hash });
  rememberReturn();
  resetCtx();
  navigate('#/login');
}

const ROUTE_MODULES = {
  '#/members': 'members',
  '#/recruitment': 'recruitment',
  '#/organisation': 'organisation',
  '#/tasks': 'tasks',
  '#/meetings': 'meetings',
  '#/reports': 'reports',
  '#/leadership': 'hq',
  '#/announcements': 'announcements',
  '#/settings': 'settings',
  '#/programmes': 'programmes',
  '#/cases': 'cases',
  '#/helpdesk': 'helpdesk',
  '#/library': 'library',
  '#/documents': 'documents',
  '#/hq': 'hq',
  '#/leaders': 'hq',
  '#/command': 'hq',
  '#/spotlight-review': 'hq',
  '#/outreach': 'hq',
  '#/content': 'content',
  '#/accounts': 'hq',
  '#/reflinks': 'hq',
  '#/view-as': 'hq',
};

/* wdos-clean-paste: normalise pasted text everywhere (smart quotes,
   long dashes, zero-width characters, Windows line endings). */
document.addEventListener('paste', (e) => {
  const el2 = e.target;
  const ok = el2 && (el2.tagName === 'TEXTAREA'
    || (el2.tagName === 'INPUT' && (el2.type === 'text' || el2.type === 'search')));
  if (!ok) return;
  const raw = (e.clipboardData || window.clipboardData).getData('text');
  if (!raw) return;
  e.preventDefault();
  const clean = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n');
  const start = el2.selectionStart ?? el2.value.length;
  const end = el2.selectionEnd ?? el2.value.length;
  el2.value = el2.value.slice(0, start) + clean + el2.value.slice(end);
  const pos = start + clean.length;
  el2.setSelectionRange(pos, pos);
  el2.dispatchEvent(new Event('input', { bubbles: true }));
});

async function boot() {
  // Phase 214: a sign-in that came back as '#/#access_token=...' (the Google
  // address used from v66.6 to v84.8, or such a link still open somewhere) is
  // rewritten to '#access_token=...' BEFORE the Supabase client starts, so the
  // client can read the tokens. Before, the person landed back on the form.
  try {
    const dbl = /^#\/?#((?:access_token|error|error_code|error_description|refresh_token)=.*)$/.exec(location.hash);
    if (dbl) history.replaceState(null, '', location.pathname + location.search + '#' + dbl[1]);
  } catch { /* leave the address alone */ }
  // Supabase recovery links land with tokens in the hash; the client
  // consumes them, then we route to the reset screen.
  if (location.hash.includes('type=recovery')) {
    setTimeout(() => { location.hash = '#/reset'; }, 400);
  }
  if (localStorage.getItem('wdos.theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  }
  const root = document.getElementById('app');
  try {
    await loadConfig();
    initDb();
    registerLocaleLoader(async (code) => {
      const { getOrgSetting } = await import('./core/db.js');
      const d = await getOrgSetting('locale_' + code);
      return d && typeof d === 'object' ? d : null;
    });
    await initI18n();
  } catch (err) {
    root.innerHTML =
      `<div class="state"><h3>WDOS could not start</h3>` +
      `<p>${String(err?.message ?? err)
        .replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p></div>`;
    return;
  }

  const authed = (page) => async (outlet, params) => {
    const session = await getSession();
    // No live session (it ended between the guard and here): sign-in form,
    // and come back to this page afterwards.
    if (!session) { sendToLogin('no_session'); return () => {}; }
    // Throws only when the database cannot be reached: the router then shows
    // "Try again" rather than sending a signed-in person to the sign-in form.
    const ok = await ensureContext(session);
    if (!ok || !ctx.profile) { sendToLogin('no_profile'); return () => {}; }
    if (!window.__wdosSidebars) await sidebarsReady;
    try { initBrowserNotify(ctx.profile); } catch { /* optional */ }
    // Phase 145: a photo uploaded at registration lands on the profile at first sign-in
    if (!ctx.photoChecked) { ctx.photoChecked = true; import('./core/db.js').then((m) => m.adoptPendingPhoto(ctx.profile)).catch(() => {}); }
    // Phase 145 gate: a seated leader who has not ticked "Read the Volunteer
    // Leadership Pack" can only open onboarding, profile, documents,
    // templates, support, settings, help and the home page.
    if (!ctx.hq) {
      // Phase 194: a CANDIDATE (someone in a 3-Day or 7-Day activation who holds
      // no seat) is not a volunteer leader. Until her activation is complete and
      // HQ has decided, she sees her activation, help, profile and settings only.
      if (ctx.candidate === undefined) {
        try {
          const st = await myCandidateState().catch(() => null);
          if (!st || st.hq || st.has_seat) ctx.candidate = false;
          else {
            const selected = st.activation && st.activation.outcome === 'selected';
            // no seat AND (an activation that is not yet selected OR a fresh applicant OR came through a referral form)
            ctx.candidate = !selected && (!!st.activation || st.status === 'applicant' || st.status === 'under_review' || !!st.referral_code);
          }
        } catch { ctx.candidate = false; }
      }
      if (ctx.candidate) {
        const h = (location.hash || '#/').split('?')[0];
        const openC = ['#/activation', '#/my/profile', '#/my/support', '#/my/settings', '#/ask', '#/logout'];
        if (!openC.some((o) => h === o || h.startsWith(o + '/') || h.startsWith(o + '?'))) {
          navigate('#/activation'); return () => {};
        }
      }
      if (ctx.gated === undefined) {
        try {
          const roles = await getMyRoles().catch(() => []);
          if ((roles || []).length) {
            const st = await onboardingStatus();
            ctx.gated = !(st?.steps || []).some((x) => x.code === 'pack' && x.done_at);
          } else ctx.gated = false;
        } catch { ctx.gated = false; }
      }
      const h = (location.hash || '#/').split('?')[0];
      const open = ['#/', '#/activation', '#/my/onboarding', '#/my/profile', '#/my/messages', '#/my/documents', '#/my/templates', '#/my/support', '#/my/settings', '#/ask', '#/me', '#/content', '#/feedback'];
      if (ctx.gated && !open.some((o) => h === o || (o !== '#/' && h.startsWith(o))) && !allowedByVisit(ctx.profile.id, h)) {
        navigate('#/my/onboarding'); return () => {};
      }
    }
    // Phase 131 (gap 6): last_seen_at follows real activity, not just boot
    if (!ctx.seenAt || Date.now() - ctx.seenAt > 10 * 60 * 1000) {
      ctx.seenAt = Date.now();
      touchLastSeen();
    }
    // Phase 182: the account's preferred language is only a STARTING point,
    // applied when this browser has never chosen a language. Until now it was
    // re-applied on every page change, so a leader whose account said French
    // (Benin DCR) was pushed back to French seconds after picking English —
    // and if the account save failed silently, forever.
    try {
      const want = ctx.profile?.preferred_locale;
      const { getLocale, setLocale, hasLocalChoice } = await import('./core/i18n.js');
      if (want && !hasLocalChoice() && want !== getLocale()) await setLocale(want);
    } catch { /* keep current language */ }
    if (!ctx.modules) {
      try { ctx.modules = await getMyModules(); }
      catch { ctx.modules = new Set(['tasks', 'meetings', 'announcements']); }
    }
    const teardown = await page.render(outlet, params, ctx);
    // Phase 214: on the page of an onboarding visit step, show the way back
    // and record the step once she has looked at it.
    if (!ctx.hq) { try { onPageShown(ctx.profile.id, location.hash); } catch { /* optional */ } }
    return teardown;
  };

  registerRoute('#/login', (o, p) => login.render(o, p), { isPublic: true });
  registerRoute('#/reset', (o, p) => reset.render(o, p), { isPublic: true });
  registerRoute('#/doctor', authed(doctor.render));
  registerRoute('#/read', authed(readpage.render));
  registerRoute('#/id', (o, p) => idstart.render(o, p), { isPublic: true });
  registerRoute('#/apply', (o, p) => apply.render(o, p), { isPublic: true });
  // Phase 192: the 3-Day referral link opens the signup directly; the candidate journey; HQ analytics
  registerRoute('#/join/:code', async (o, p) => (await import('./pages/join.js')).render(o, p), { isPublic: true });
  registerRoute('#/candidate', async (o, p) => (await import('./pages/candidate.js')).render(o, p), { isPublic: true });
  registerRoute('#/activation', authed({ render: async (o, p, c) => (await import('./pages/activation.js')).render(o, p, c) }));
  registerRoute('#/hq/activation', authed({ render: async (o, p, c) => (await import('./pages/hqactivation.js')).render(o, p, c) }));
  registerRoute('#/ops', authed({ render: async (o, p, c) => (await import('./pages/ops.js')).render(o, { ...p, tab: 'overview' }, c) }));
  registerRoute('#/ops/:tab', authed({ render: async (o, p, c) => (await import('./pages/ops.js')).render(o, p, c) }));
  registerRoute('#/hq/mailboxes', authed({ render: async (o, p, c) => (await import('./pages/hqmailboxes.js')).render(o, p, c) }));
  registerRoute('#/r/:code', (o, p) => refland.render(o, p), { isPublic: true });
  // A deep link to /wgmn or /wnnn (no hash, or the default hash) opens that network's door
  const pathNet = (location.pathname || '').replace(/\/+$/, '').split('/').pop().toLowerCase();
  if ((pathNet === 'wgmn' || pathNet === 'wnnn') && (!location.hash || location.hash === '#/' || location.hash === '#/volunteer')) {
    history.replaceState(null, '', `/#/${pathNet}`);
  }
  registerRoute('#/wgmn', (o, p) => volunteer.render(o, { ...p, network: 'WGMN' }), { isPublic: true });
  registerRoute('#/wnnn', (o, p) => volunteer.render(o, { ...p, network: 'WNNN' }), { isPublic: true });
  registerRoute('#/claim', (o, p) => claim.render(o, p), { isPublic: true });
  registerRoute('#/volunteer', (o, p) => volunteer.render(o, p), { isPublic: true });
  registerRoute('#/', authed({ render: (o, p, c) => {
    if (!c.hq) return home.render(o, p, c);
    const fn = c.profile?.hq_function || window.__wdosHqFn || 'founder';
    // Phase 167: every HQ role has its own opening screen. Founder / Executive
    // keeps the strategic Command Centre; HOFCO has Reference Screen 1; the
    // other seven roles open their Common-HQ-Dashboard homepage.
    if (fn === 'founder') return central.render(o, p, c);
    if (fn === 'hofco') return hofco.render(o, p, c);
    return rolehome.render(o, p, c);
  } }));
  registerRoute('#/planned/:key', authed(planned));
  registerRoute('#/engagement', authed(engagement));
  registerRoute('#/network/:net', authed(networkhq));
  registerRoute('#/dashboard', authed(dashboard));
  registerRoute('#/my/:tab', authed(home));
  // Phase 171: View as. HQ staff open on their HQ screen (HOFCO, role home or
  // Command Centre by hq_function); volunteers on the volunteer dashboard.
  registerRoute('#/view-as/:id', authed({ render: async (o, p, c) => {
    let target = null;
    try { const { data } = await db().from('profiles').select('id, first_name, last_name, email, network, country, hq_function').eq('id', p.id).maybeSingle(); target = data; } catch { target = null; }
    let fn = null;
    if (target) { try { const { data } = await db().rpc('hq_function_of', { pid: target.id }); fn = data || null; } catch { fn = null; } }
    if (!fn) return home.render(o, p, c);
    const c2 = { ...c, profile: { ...c.profile, ...target, hq_function: fn }, viewAs: target };
    const teardown = fn === 'founder' ? await central.render(o, p, c2) : fn === 'hofco' ? await hofco.render(o, p, c2) : await rolehome.render(o, p, c2);
    const banner = document.createElement('div'); banner.className = 'vs-viewas';
    banner.innerHTML = `<span>${t('acc.viewingHq', { name: `${target.first_name} ${target.last_name}`, fn: t('hqfn.' + fn) })}</span>`;
    const back = document.createElement('a'); back.href = '#/accounts'; back.className = 'btn btn--secondary'; back.textContent = t('acc.backToAccounts'); banner.append(back);
    const main = o.querySelector('.main, main') || o; main.prepend(banner);
    return teardown;
  } }));
  registerRoute('#/accounts', authed(accounts));
  registerRoute('#/structure', authed(structure));
  registerRoute('#/reflinks', authed(reflinks));
  registerRoute('#/reporting', authed(reporting));
  registerRoute('#/reporting/:tab', authed(reporting));
  registerRoute('#/reporting/:tab/:id', authed(reporting));
  // Phase 185: #/me is retired. Everything it held now lives on the leader
  // dashboard and in the sidebar; the old links redirect rather than break.
  const meRedirect = () => {
    const h = (location.hash || '').replace('#/me', '');
    const to = h.startsWith('/journey') ? '#/my/onboarding'
      : h.startsWith('/learn') ? '#/my/messages'
      : h.startsWith('/profile') ? '#/my/profile' : '#/';
    location.replace(location.pathname + location.search + to);
  };
  registerRoute('#/me', authed(meRedirect));
  registerRoute('#/content', authed(content));
  registerRoute('#/feedback', authed(uat));
  registerRoute('#/ask', authed(ask));
  registerRoute('#/messages', authed(messages));
  registerRoute('#/room', authed(room));
  registerRoute('#/interpret', authed(interpret));
  registerRoute('#/me/:tab', authed(meRedirect));
  registerRoute('#/members', authed(membersList));
  registerRoute('#/members/:id', authed(memberDetail));
  registerRoute('#/recruitment', authed(recruitment));
  registerRoute('#/recruitment/:id', authed(recruitment));
  registerRoute('#/organisation', authed(organisation));
  registerRoute('#/country/:id', authed(countryhq));
  registerRoute('#/tasks', authed(tasks));
  registerRoute('#/meetings', authed(meetings));
  registerRoute('#/reports', authed(reports));
  registerRoute('#/leadership', authed((o, p, c) => leadership.render(o, p, c)));
  registerRoute('#/announcements', authed(announcements));
  registerRoute('#/settings', authed(settings));
  registerRoute('#/programmes', authed(programmes));
  registerRoute('#/cases', authed(cases));
  registerRoute('#/cases/:id', authed(cases));
  registerRoute('#/helpdesk', authed(helpdesk));
  registerRoute('#/helpdesk/:id', authed(helpdesk));
  registerRoute('#/library', authed(library));
  registerRoute('#/documents', authed(documents));
  registerRoute('#/hq', authed(hq));
  registerRoute('#/leaders', authed(leaders));
  registerRoute('#/command', authed(command));
  registerRoute('#/spotlight-review', authed(spotlight));
  registerRoute('#/outreach', authed(outreach));

  setGuard(async (route) => {
    const session = await getSession();
    if (!route.isPublic && !session) { rememberReturn(); return '#/login'; }
    if (session && location.hash.startsWith('#/login')) return '#/';
    // Module gate: routes are only reachable if HQ granted the module.
    const base = '#/' + (location.hash.split('/')[1] ?? '');
    const needed = ROUTE_MODULES[base];
    if (session && needed) {
      if (!ctx.modules || ctx.uid !== session.user.id) await ensureContext(session);
      if (!(ctx.modules || new Set(FALLBACK_MODULES)).has(needed)) return '#/';
    }
    return null;
  });

  const dropSnap = () => { try { sessionStorage.removeItem(CTX_KEY); } catch { /* ok */ } };
  window.addEventListener('wdos:onboarding-changed', () => { ctx.gated = undefined; dropSnap(); });
  window.addEventListener('wdos:activation-changed', () => { ctx.candidate = undefined; dropSnap(); });
  // Diagnostics: a sign-in slot changed by ANOTHER window on this computer.
  window.addEventListener('storage', (e) => {
    try {
      if (!e.key || !e.key.startsWith('wdos.auth.s.')) return;
      let who = null; try { who = JSON.parse(e.newValue || 'null')?.user?.email || null; } catch { /* not json */ }
      if (!e.newValue) authLog('slot_removed_elsewhere', { who });
    } catch { /* diagnostics only */ }
  });
  onAuthChange(async (session, event) => {
    // who: the signed-in email, so a second tab signing in as someone else is visible in the log
    if (event !== 'TOKEN_REFRESHED') authLog(event || (session ? 'session' : 'no_session'), { user: !!session, who: session?.user?.email || null });
    if (event !== 'SIGNED_OUT') {
      // SIGNED_IN can also be another window announcing its own sign-in; this
      // window keeps its own. Only react when THIS window's person changed.
      if (event === 'SIGNED_IN' && ctx.uid) {
        const mine = await getSession();
        if (mine && mine.user.id !== ctx.uid) { resetCtx(); if (!isPublicHash(location.hash)) refresh(); }
      }
      return;
    }
    const byUser = wasUserSignOut();
    // Phase 215: public pages (candidate sign-in, referral forms, registration)
    // sign out on purpose to start clean. Nobody is moved anywhere.
    if (isPublicHash(location.hash)) { resetCtx(); authLog('signed_out_on_public_page', { page: location.hash.split('?')[0] }); return; }
    if (!byUser) {
      // Not this window's click: another window may have signed out a
      // DIFFERENT sign-in. Only leave if this window's own session is gone.
      await new Promise((r) => setTimeout(r, 600));
      const still = await getSession();
      if (still) { authLog('spurious_signed_out_ignored'); return; }
      if (isPublicHash(location.hash)) { resetCtx(); return; }   // moved to a public page meanwhile
      authLog('auto_signed_out', { page: location.hash });
      try { localStorage.setItem('wdos.lastAutoSignOut', JSON.stringify({ at: new Date().toISOString(), page: location.hash, build: (await import('./core/db.js')).APP_VERSION })); } catch { /* ok */ }
    }
    // Cached rows must never survive a sign-out on a shared device.
    if ('caches' in window) caches.delete('wdos-data').catch(() => {});
    if (byUser) { resetCtx(); navigate('#/login'); } else sendToLogin('signed_out');
  });

  // Offline-first: register the service worker (no-op where unsupported).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Phase 191: when a new build activates, reload this window ONCE for that
    // build and never again. Guarded per window so no combination of tabs,
    // pinned apps or update checks can turn it into a loop.
    navigator.serviceWorker.addEventListener('message', (ev) => {
      const d = ev.data || {};
      if (d.type !== 'wdos:new-build' || !d.version) return;
      let seen = '';
      try { seen = sessionStorage.getItem('wdos.reloaded.for') || ''; } catch { seen = ''; }
      if (seen === d.version) return;
      try { sessionStorage.setItem('wdos.reloaded.for', d.version); } catch { /* ignore */ }
      setTimeout(() => location.reload(), 400);
    });
  }

  document.title = t('app.title');
  await startRouter();
  if ((document.getElementById('app')?.children?.length ?? 0) > 0) {
    window.__wdosReady = true;
  }
}

boot();
