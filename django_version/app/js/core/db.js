/**
 * WDOS data layer.
 * The ONLY module allowed to talk to Supabase. Every page and component
 * goes through the functions exported here, which keeps the application
 * vendor-independent: replacing Supabase means rewriting this file, not
 * the app.
 *
 * The Supabase client is the official single-file build, downloaded once
 * and stored at /assets/vendor/supabase.js (loaded by index.html before
 * the app starts). No build tools, no runtime CDN dependency — the app
 * owns its copy. See docs/SETUP.md §3.
 */
import { getConfig } from './config.js';

function createClient(url, key, options) {
  if (!window.supabase?.createClient) {
    throw new Error(
      'assets/vendor/supabase.js is missing — see docs/SETUP.md, Part E'
    );
  }
  return window.supabase.createClient(url, key, options);
}

let client = null;

/* ------------------------------------------------------------------ */
/* Phase 212 — sessions that survive wrong device clocks and many tabs */
/* ------------------------------------------------------------------ */
/* 1. The device clock. An access token is valid for one hour by the SERVER's
   clock, but the Supabase library judges "has it expired?" with the DEVICE's
   clock. A computer whose clock is an hour fast (common: time zone left on
   UTC and the time moved forward by hand) sees every new token as already
   expired, refreshes before every single request, hits Supabase's rate limit
   (429) and then deletes the session: the person lands on the sign-in page,
   and the Sign in button appears to do nothing. Every time a new token
   arrives we measure how far the device clock is from the server's (the
   token's "issued at" stamp), and we show the library the token's expiry in
   device-clock terms. Every expiry decision is then correct whatever the
   device clock says. The difference is kept, so the next visit is right from
   the first request.
   2. Several windows. Phase 180 gave each window its own copy of the session;
   a window opened later copied the first one's tokens, so both refreshed the
   same refresh token independently and Supabase, seeing a refresh token used
   twice, revoked the session for both. Now windows that share a sign-in share
   ONE stored token (a slot, keyed by the session id inside the token): a
   refresh in one is seen by all. A different sign-in in another window gets
   its own slot, so "Regina in one window, HQ in another" still works. A new
   window opens on the most recent sign-in, as before.
   3. Rate limits and storms. A refresh answered 429, or more than six
   refreshes in a minute, pauses refreshing for 30 seconds and is reported to
   the library as a temporary network problem, which keeps the session
   instead of deleting it. */

const TOKEN_KEY_RE = /^sb-.+-auth-token$/;
const CLOCK_KEY = 'wdos.clock';
const SLOT_PREFIX = 'wdos.auth.s.';
const SLOT_INDEX = 'wdos.auth.index';
const LATEST_KEY = 'wdos.auth.latest';
const WINDOW_KEY = 'wdos.auth.slot';
const SIGNED_OUT_HERE = '-';

let clockSkew = (() => {
  try {
    const c = JSON.parse(localStorage.getItem(CLOCK_KEY) || 'null');
    if (c && Number.isFinite(c.skew) && Math.abs(Date.now() - c.at) < 14 * 864e5) return c.skew;
  } catch { /* none kept */ }
  return 0;
})();
/** Seconds the device clock is ahead of the server (negative: behind). */
export function deviceClockSkew() { return clockSkew; }

function jwtClaims(token) {
  try {
    const part = String(token).split('.')[1];
    const b = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
  } catch { return null; }
}

function noteFreshToken(accessToken) {
  const c = jwtClaims(accessToken);
  if (!c || !Number.isFinite(c.iat)) return;
  const sample = Math.round(Date.now() / 1000 - c.iat);
  const next = Math.abs(sample) < 30 ? 0 : sample;   // under 30 s is network delay, not a wrong clock
  if (Math.abs(next - clockSkew) >= 30) authLog('clock_skew', { skew: next });
  clockSkew = next;
  try { localStorage.setItem(CLOCK_KEY, JSON.stringify({ skew: next, at: Date.now() })); } catch { /* ok */ }
}

let tokenStorageKey = null;
let authStore = null;

function authStorage() {
  const ss = window.sessionStorage, ls = window.localStorage;
  const safe = (fn, dflt = null) => { try { return fn(); } catch { return dflt; } };
  const parse = (raw) => { try { return raw == null ? null : JSON.parse(raw); } catch { return null; } };
  const iatOf = (s) => (s && jwtClaims(s.access_token)?.iat) || 0;
  const slotOf = (s) => { const c = s && jwtClaims(s.access_token); return (c && (c.session_id || c.sub)) || null; };
  const index = () => parse(safe(() => ls.getItem(SLOT_INDEX))) || {};
  const readSlot = (sid) => safe(() => ls.getItem(SLOT_PREFIX + sid)) ?? safe(() => ss.getItem(SLOT_PREFIX + sid));

  function putSlot(s, { adopt }) {
    const sid = slotOf(s); if (!sid) return null;
    const c = jwtClaims(s.access_token);
    if (c?.exp) s.expires_at = c.exp;                  // always store the server's real expiry
    const cur = parse(readSlot(sid));
    // never overwrite a newer token (another window may have refreshed first)
    if (!cur || iatOf(s) >= iatOf(cur) || cur.refresh_token === s.refresh_token) {
      const json = JSON.stringify(s);
      // browsers that refuse localStorage (old private modes) keep it per window
      if (safe(() => { ls.setItem(SLOT_PREFIX + sid, json); return true; }, false)) safe(() => ss.removeItem(SLOT_PREFIX + sid));
      else safe(() => ss.setItem(SLOT_PREFIX + sid, json));
    }
    const idx = index(); idx[sid] = { at: Date.now(), who: s.user?.email || null };
    const keep = Object.entries(idx).sort((a, b) => b[1].at - a[1].at);
    for (const [old] of keep.slice(6)) { safe(() => ls.removeItem(SLOT_PREFIX + old)); delete idx[old]; }
    safe(() => ls.setItem(SLOT_INDEX, JSON.stringify(idx)));
    if (adopt) { safe(() => ss.setItem(WINDOW_KEY, sid)); safe(() => ls.setItem(LATEST_KEY, sid)); }
    return sid;
  }
  function migrateLegacy(k) {
    // Phase 180 kept the session under the library's own key in both stores.
    const mine = parse(safe(() => ss.getItem(k)));
    const shared = parse(safe(() => ls.getItem(k)));
    if (shared?.access_token) {
      const sid = putSlot(shared, { adopt: false });
      if (sid && !safe(() => ls.getItem(LATEST_KEY))) safe(() => ls.setItem(LATEST_KEY, sid));
    }
    if (mine?.access_token) putSlot(mine, { adopt: true });
    safe(() => ss.removeItem(k)); safe(() => ls.removeItem(k));
  }
  function toDevice(raw) {
    if (raw == null || !clockSkew) return raw;
    const s = parse(raw); if (!s) return raw;
    const exp = jwtClaims(s.access_token)?.exp ?? s.expires_at;
    if (exp) s.expires_at = exp + clockSkew;
    return JSON.stringify(s);
  }
  return {
    getItem(k) {
      if (!TOKEN_KEY_RE.test(k)) {
        return safe(() => { let v = ss.getItem(k); if (v == null) { v = ls.getItem(k); if (v != null) ss.setItem(k, v); } return v; });
      }
      let sid = safe(() => ss.getItem(WINDOW_KEY));
      if (!sid) {
        if (safe(() => ss.getItem(k) ?? ls.getItem(k)) != null) migrateLegacy(k);
        sid = safe(() => ss.getItem(WINDOW_KEY)) || safe(() => ls.getItem(LATEST_KEY));
        if (sid) safe(() => ss.setItem(WINDOW_KEY, sid));
      }
      if (!sid || sid === SIGNED_OUT_HERE) return null;
      return toDevice(readSlot(sid));
    },
    setItem(k, v) {
      if (!TOKEN_KEY_RE.test(k)) { safe(() => ss.setItem(k, v)); safe(() => ls.setItem(k, v)); return; }
      const s = parse(v); if (s?.access_token) putSlot(s, { adopt: true });
    },
    removeItem(k) {
      if (!TOKEN_KEY_RE.test(k)) { safe(() => ss.removeItem(k)); safe(() => ls.removeItem(k)); return; }
      const sid = safe(() => ss.getItem(WINDOW_KEY));
      if (sid && sid !== SIGNED_OUT_HERE) {
        safe(() => ls.removeItem(SLOT_PREFIX + sid)); safe(() => ss.removeItem(SLOT_PREFIX + sid));
        const idx = index(); delete idx[sid]; safe(() => ls.setItem(SLOT_INDEX, JSON.stringify(idx)));
        if (safe(() => ls.getItem(LATEST_KEY)) === sid) {
          const next = Object.entries(idx).sort((a, b) => b[1].at - a[1].at)[0]?.[0];
          safe(() => (next ? ls.setItem(LATEST_KEY, next) : ls.removeItem(LATEST_KEY)));
        }
      }
      // this window stays signed out until someone signs in here; it must not
      // silently pick up another person's sign-in from a different window
      safe(() => ss.setItem(WINDOW_KEY, SIGNED_OUT_HERE));
      safe(() => ss.removeItem(k)); safe(() => ls.removeItem(k));
    },
  };
}

/** The session as stored for this window (no network, no refresh). */
export function storedSession() {
  if (!authStore || !tokenStorageKey) return null;
  try {
    const s = JSON.parse(authStore.getItem(tokenStorageKey) || 'null');
    return s?.access_token && s?.refresh_token && s?.user ? s : null;
  } catch { return null; }
}

let refreshTimes = [];
let refreshPausedUntil = 0;
function authFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  if (!url.includes('/auth/v1/')) return fetch(input, init);
  const isRefresh = url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');
  if (isRefresh) {
    const now = Date.now();
    if (now < refreshPausedUntil) return Promise.reject(new TypeError('WDOS: token refresh paused'));
    refreshTimes = refreshTimes.filter((t) => now - t < 60000 && t <= now);
    if (refreshTimes.length >= 6) {
      refreshPausedUntil = now + 30000;
      authLog('refresh_storm_paused', { n: refreshTimes.length });
      return Promise.reject(new TypeError('WDOS: token refresh paused (too many)'));
    }
    refreshTimes.push(now);
  }
  return fetch(input, init).then(async (res) => {
    if (isRefresh && res.status === 429) {
      refreshPausedUntil = Date.now() + 30000;
      authLog('refresh_rate_limited');
      throw new TypeError('WDOS: token refresh rate-limited');
    }
    if (res.ok && /\/auth\/v1\/(token|verify|signup)/.test(url)) {
      try { const j = await res.clone().json(); if (j?.access_token) noteFreshToken(j.access_token); } catch { /* not a session */ }
    }
    return res;
  });
}

export function initDb() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  try { tokenStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`; } catch { tokenStorageKey = null; }
  authStore = authStorage();
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storage: authStore },
    global: { fetch: authFetch },
  });
  // Phase 170 kept a second copy of the tokens for "silent recovery"; recovery
  // could revive another window's tokens and get the session revoked. Retired.
  try { localStorage.removeItem('wdos.session.backup'); } catch { /* ok */ }
  return client;
}

export function db() {
  if (!client) throw new Error('initDb() must run before db()');
  return client;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export async function signIn(email, password) {
  const { data, error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  try { localStorage.removeItem('wdos.session.backup'); } catch { /* ok */ }
  try { sessionStorage.removeItem('wdos.ctx.v1'); sessionStorage.removeItem('wdos.ctx.v2'); } catch { /* ok */ }
  invalidateDashCache();
  markUserSignOut();
  authLog('user_sign_out');
  const { error } = await db().auth.signOut();
  if (error) throw error;
}

/** The current session. Never throws: when a refresh fails for a temporary
 *  reason (network, rate limit) the library keeps the stored session and so
 *  do we, instead of treating the person as signed out. When the server has
 *  really ended the session the library deletes it and this returns null. */
export async function getSession() {
  let res;
  try { res = await db().auth.getSession(); }
  catch (e) { authLog('get_session_threw', { msg: String(e?.message || e).slice(0, 120) }); return usableStoredSession(); }
  if (!res.error) return res.data.session;
  authLog('get_session_error', { msg: String(res.error.message || '').slice(0, 120), status: res.error.status ?? null });
  return usableStoredSession();
}

/* Phase 216: the stored session is only a stand-in while its access token is
   still valid (by the server's clock). v84.7 returned it even after the token
   had expired; the page then believed it was signed in while every database
   call went out anonymous ("Not signed in"), the page sent the person to the
   sign-in form, the form saw a "session" and sent her back: a loop of about
   two calls a second (seen live on 2 Oct). An expired token with a refresh
   that cannot get through is honestly "signed out for now". */
function usableStoredSession() {
  const s = storedSession();
  const exp = s && jwtClaims(s.access_token)?.exp;
  if (!exp) return null;
  const serverNow = Date.now() / 1000 - clockSkew;
  return exp > serverNow + 5 ? s : null;
}

/** Auth events. The handler runs after the library has finished its own
 *  work: calling the library from inside its callback can deadlock it. */
export function onAuthChange(handler) {
  return db().auth.onAuthStateChange((event, session) => {
    setTimeout(() => { Promise.resolve().then(() => handler(session, event)).catch(() => {}); }, 0);
  });
}

/* Auth diagnostics (v67.1): a ring buffer of the last 30 auth events with
   timestamps, page and build, kept in localStorage so the reason for an
   unexpected sign-out can be read afterwards (login page + #/doctor). */
export function authLog(event, extra = {}) {
  try {
    const key = 'wdos.authlog';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push({ at: new Date().toISOString(), event, hash: location.hash, build: APP_VERSION, who: extra.who || null, ...extra });
    localStorage.setItem(key, JSON.stringify(arr.slice(-30)));
  } catch { /* storage unavailable */ }
}
export function readAuthLog() {
  try { return JSON.parse(localStorage.getItem('wdos.authlog') || '[]'); } catch { return []; }
}
let userSignOut = false;
export function markUserSignOut() { userSignOut = true; }
export function wasUserSignOut() { const v = userSignOut; userSignOut = false; return v; }

/* ------------------------------------------------------------------ */
/* Profiles / Members                                                  */
/* ------------------------------------------------------------------ */

const PROFILE_COLUMNS =
  'id, membership_no, first_name, last_name, email, phone, network, status, ' +
  'org_unit_id, preferred_locale, birth_date, created_at, updated_at, hq_function, country, state_region, lga, role_applied, is_leader';

export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  // The profile row is created by a database trigger the instant the auth
  // user appears. Right after sign-in (Google most of all) the SELECT can
  // arrive a moment before that row is visible, so a single miss is not an
  // error: retry a few times, then report "no row yet" as null rather than
  // throwing the person to a dead screen. maybeSingle() returns null (not
  // an error) when zero rows match.
  let lastErr = null;
  for (let i = 0; i < 6; i += 1) {
    const { data, error } = await db()
      .from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).maybeSingle();
    if (!error && data) return data;
    lastErr = error;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (lastErr) throw lastErr;
  return null;
}

/** True once the signed-in user has a profile row. Used by the OAuth
 *  landing guard so a brand-new Google sign-in is not bounced as "no
 *  profile" before the trigger has run. */
export async function hasProfile() {
  const session = await getSession();
  if (!session) return false;
  const { data } = await db()
    .from('profiles').select('id').eq('id', session.user.id).maybeSingle();
  return !!data;
}

/**
 * List members visible to the current user (RLS enforces scope).
 * @param {object} opts { search, status, network, page, pageSize }
 */
export async function listMembers(opts = {}) {
  const { search = '', status = '', network = '', page = 0, pageSize = 25 } = opts;
  let q = db()
    .from('field_members')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (status) q = q.eq('status', status);
  if (network) q = q.eq('network', network);
  if (search) {
    const s = search.replaceAll('%', '').replaceAll(',', '');
    q = q.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,` +
      `email.ilike.%${s}%,membership_no.ilike.%${s}%`
    );
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function getMember(id) {
  const { data, error } = await db()
    .from('profiles').select(PROFILE_COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function updateMember(id, patch) {
  const allowed = ['first_name', 'last_name', 'phone', 'network',
    'status', 'org_unit_id', 'preferred_locale', 'membership_no'];
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowed.includes(k))
  );
  const { data, error } = await db()
    .from('profiles').update(clean).eq('id', id)
    .select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Organisational structure                                            */
/* ------------------------------------------------------------------ */

export async function listCountryLevelNames() {
  const { data, error } = await db()
    .from('country_level_names')
    .select('country_id, level, local_name');
  if (error) throw error;
  const map = new Map();
  for (const row of data) {
    if (!map.has(row.country_id)) map.set(row.country_id, {});
    map.get(row.country_id)[row.level] = row.local_name;
  }
  return map;
}

export async function listOrgUnits() {
  const { data, error } = await db()
    .from('org_units')
    .select('id, parent_id, level, name, country_iso, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregates (head-only count queries; cheap under RLS)     */
/* ------------------------------------------------------------------ */

async function countWhere(build) {
  let q = db().from('field_members')
    .select('id', { count: 'exact', head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardStats() {
  const [total, active, pipeline, training] = await Promise.all([
    countWhere((q) => q),
    countWhere((q) => q.eq('status', 'active')),
    countWhere((q) => q.in('status', ['applicant', 'under_review', 'approved'])),
    countWhere((q) => q.eq('status', 'in_training')),
  ]);
  return { total, active, pipeline, training };
}

/* ------------------------------------------------------------------ */
/* Roles (current user)                                                */
/* ------------------------------------------------------------------ */

const APPROVER_ROLES = new Set(['super_admin', 'executive_director', 'hq_team',
  'country_rep', 'deputy_country_rep', 'state_coordinator']);

export async function getMyRoles() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await db()
    .from('role_assignments')
    .select('role, org_unit_id, org_unit:org_units(name, level)')
    .eq('profile_id', session.user.id)
    .is('ends_at', null);
  if (error) throw error;
  return data;
}

/** My teammates — anyone sharing one of my leadership seats. */
export const myTeam = () => appRpc('my_team', {});

/** Everyone at or below any leadership seat I hold — my own region's
 *  chart, vacant seats shown honestly. */
export const mySubtree = () => appRpc('my_subtree', {});

export function isApprover(roles) {
  return roles.some((r) => APPROVER_ROLES.has(r.role));
}

/* ------------------------------------------------------------------ */
/* Recruitment — applications                                          */
/* ------------------------------------------------------------------ */

const APP_COLUMNS =
  'id, first_name, last_name, email, phone, network, org_unit_id, motivation, ' +
  'preferred_locale, status, reviewer_id, reviewer_notes, recommended_at, ' +
  'decided_by, decision_reason, decided_at, profile_id, created_at, updated_at';

/** Public submission — works without a session (anon RLS insert policy).
 *  No RETURNING: anonymous visitors may write an application but never
 *  read one back, so we must not ask for the row. */
/** Phase 119 — Google sign-in. Replaces the password step only; the
 *  registration forms remain the door (they capture the age question
 *  that decides the network). Redirects back to this origin. */
export const signInWithGoogle = () =>
  db().auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Phase 214: the BARE site address. v66.6 added '#/' here, and
      // Supabase appends its tokens after another '#', so people landed on
      // '#/#access_token=...', which the library cannot read: every Google
      // sign-in since then ended back on the sign-in form. The OAuth guard
      // in router.js moves the person to '#/' once the session is in.
      redirectTo: window.location.origin + '/',
      queryParams: { prompt: 'select_account' },
    },
  });

export async function submitApplication(fields) {
  const { error } = await db()
    .from('applications')
    .insert({
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email,
      phone: fields.phone || null,
      network: fields.network,
      org_unit_id: fields.org_unit_id,
      motivation: fields.motivation,
      preferred_locale: fields.preferred_locale || 'en',
    });
  if (error) throw error;
}

export async function listApplications(opts = {}) {
  const { status = '', page = 0, pageSize = 25 } = opts;
  let q = db()
    .from('applications')
    .select(APP_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function getApplication(id) {
  const { data, error } = await db()
    .from('applications').select(APP_COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

// Phase 109: under load spikes on the free tier, a request can fail once
// and succeed a moment later. Reads get ONE quiet retry with a short
// jittered pause before the person ever sees an error. Anything that
// changes data is never retried, so nothing can double-send.
const NO_RETRY_PREFIXES = ['report_s', 'report_r', 'report_n', 'reporting_rem', 'hq_update', 'hq_set', 'hq_end', 'hq_link',
  'send_', 'dispatch_', 'submit_', 'set_',
  'record_', 'promote_', 'decide_', 'approve_', 'hold_', 'publish_',
  'create_', 'claim_', 'notify_', 'review_', 'recommend_', 'file_',
  'add_', 'assign_', 'mark_', 'update_', 'delete_', 'reject_'];

async function appRpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (!error) return data;
  const mutates = NO_RETRY_PREFIXES.some((p) => name.startsWith(p));
  if (mutates) throw error;
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
  const second = await db().rpc(name, args);
  if (second.error) throw second.error;
  return second.data;
}

export const reviewApplication = (id, notes) =>
  appRpc('review_application', { app_id: id, notes: notes || null });
export const recommendApplication = (id, notes) =>
  appRpc('recommend_application', { app_id: id, notes });
export const decideApplication = (id, approve, reason) =>
  appRpc('decide_application', { app_id: id, approve, reason });

/* ------------------------------------------------------------------ */
/* Organisation & Leadership                                           */
/* ------------------------------------------------------------------ */

export const createOrgUnit = (parent, name, iso) =>
  appRpc('create_org_unit', { parent, unit_name: name, iso: iso || null });

export const appointLeader = (profileId, role, unit, reason) =>
  appRpc('appoint_leader', {
    target_profile: profileId, new_role: role, unit, reason,
  });

export const endAppointment = (assignmentId, reason) =>
  appRpc('end_appointment', { assignment_id: assignmentId, reason });

/** Current (and optionally past) leadership at one unit. */
export async function listUnitLeaders(unitId, { includePast = false } = {}) {
  let q = db()
    .from('role_assignments')
    .select('id, role, starts_at, ends_at, ' +
      'person:profiles!role_assignments_profile_id_fkey' +
      '(id, first_name, last_name, email, membership_no)')
    .eq('org_unit_id', unitId)
    .order('starts_at', { ascending: false });
  if (!includePast) q = q.is('ends_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Members eligible for appointment (good standing), searchable. */
export const searchHqPeople = (s) =>
  appRpc('search_staff_assignees', { s: s || '' });

export const amIStaff = () =>
  appRpc('am_i_staff', {}).catch(() => false);

export async function searchAppointableMembers(search) {
  // HQ also sees active staff in the picker (definer RPC; empty for others)
  const staffP = appRpc('search_staff_assignees', { s: search || '' })
    .then((rows) => (rows || []).map((r) => ({
      id: r.id, first_name: r.first_name, last_name: r.last_name,
      email: r.email, membership_no: r.position_title, status: 'active',
    })))
    .catch(() => []);
  let rows = [];
  try {
    let q = db()
      .from('field_members')
      .select('id, first_name, last_name, email, membership_no, status')
      .in('status', ['applicant', 'under_review', 'approved', 'activated',
        'in_training', 'active', 'reinstated'])
      .order('last_name')
      .limit(25);
    if (search) {
      const s2 = search.replaceAll('%', '').replaceAll(',', '');
      q = q.or(
        `first_name.ilike.%${s2}%,last_name.ilike.%${s2}%,` +
        `email.ilike.%${s2}%,membership_no.ilike.%${s2}%`
      );
    }
    const { data, error } = await q;
    if (!error) rows = data || [];
  } catch { rows = []; }
  const staffRows = await staffP;
  const seen = new Set(rows.map((r) => r.id));
  return [...rows, ...staffRows.filter((r) => !seen.has(r.id))].slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

const TASK_COLUMNS =
  'id, title, details, org_unit_id, assigned_to, assigned_by, priority, ' +
  'status, requires_approval, due_on, completed_at, created_at, updated_at, tags, ' +
  'assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name), ' +
  'assigner:profiles!tasks_assigned_by_fkey(id, first_name, last_name)';

export async function listTasks(opts = {}) {
  const { scope = 'mine', status = '', page = 0, pageSize = 25,
    priority = '', overdueOnly = false, search = '', sort = 'due',
    dueFrom = '', dueTo = '' } = opts;
  const session = await getSession();
  let q = db()
    .from('tasks')
    .select(TASK_COLUMNS, { count: 'exact' })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (sort === 'priority') {
    q = q.order('priority', { ascending: false })
         .order('due_on', { ascending: true, nullsFirst: false });
  } else if (sort === 'newest') {
    q = q.order('created_at', { ascending: false });
  } else {
    q = q.order('due_on', { ascending: true, nullsFirst: false })
         .order('created_at', { ascending: false });
  }
  if (scope === 'mine') q = q.eq('assigned_to', session.user.id);
  if (scope === 'assigned') q = q.eq('assigned_by', session.user.id);
  // scope 'area': no extra filter — RLS already limits to visible tasks
  if (status) q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  if (overdueOnly) {
    q = q.in('status', ['not_started', 'in_progress'])
         .lt('due_on', new Date().toISOString().slice(0, 10));
  }
  if (search) {
    const sv = search.replaceAll('%', '').replaceAll(',', '');
    q = q.ilike('title', `%${sv}%`);
  }
  if (dueFrom) q = q.gte('due_on', dueFrom);
  if (dueTo) q = q.lte('due_on', dueTo);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function createTask(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('tasks')
    .insert({
      title: fields.title,
      details: fields.details || null,
      tags: fields.tags || [],
      org_unit_id: fields.org_unit_id,
      assigned_to: fields.assigned_to,
      assigned_by: session.user.id,
      priority: fields.priority,
      requires_approval: Boolean(fields.requires_approval),
      due_on: fields.due_on || null,
      completion_requirements: fields.completion_requirements || [],
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function setTaskStatus(id, status) {
  const { data, error } = await db()
    .from('tasks').update({ status }).eq('id', id)
    .select(TASK_COLUMNS).single();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Meetings & attendance                                               */
/* ------------------------------------------------------------------ */

const MEETING_COLUMNS =
  'id, title, agenda, org_unit_id, organiser, mode, platform, audience, location, starts_at, ' +
  'ends_at, status, minutes, created_at, updated_at, ' +
  'host:profiles!meetings_organiser_fkey(id, first_name, last_name)';

export async function listMeetings(opts = {}) {
  const { scope = 'upcoming', page = 0, pageSize = 25 } = opts;
  const nowIso = new Date().toISOString();
  let q = db()
    .from('meetings')
    .select(MEETING_COLUMNS, { count: 'exact' })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (scope === 'upcoming') {
    q = q.gte('ends_at', nowIso).order('starts_at', { ascending: true });
  } else {
    q = q.lt('ends_at', nowIso).order('starts_at', { ascending: false });
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function createMeeting(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('meetings')
    .insert({
      title: fields.title,
      agenda: fields.agenda || null,
      org_unit_id: fields.org_unit_id,
      organiser: session.user.id,
      mode: fields.mode,
      platform: fields.platform || 'woddi',
      audience: fields.audience || 'unit',
      location: fields.location || null,
      starts_at: fields.starts_at,
      ends_at: fields.ends_at,
    })
    .select(MEETING_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMeeting(id, patch) {
  const allowed = ['status', 'minutes', 'location', 'agenda',
    'starts_at', 'ends_at', 'mode'];
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const { data, error } = await db()
    .from('meetings').update(clean).eq('id', id)
    .select(MEETING_COLUMNS).single();
  if (error) throw error;
  return data;
}

/** Members whose home unit is the given unit (for the attendance sheet). */
export async function listUnitMembers(unitId) {
  const { data, error } = await db()
    .from('profiles')
    .select('id, first_name, last_name, membership_no, status')
    .eq('org_unit_id', unitId)
    .in('status', ['activated', 'in_training', 'active', 'reinstated', 'inactive'])
    .order('last_name');
  if (error) throw error;
  return data;
}

export async function getAttendance(meetingId) {
  const { data, error } = await db()
    .from('meeting_attendance')
    .select('id, profile_id, present')
    .eq('meeting_id', meetingId);
  if (error) throw error;
  return data;
}

/** Upsert attendance marks: entries = [{profile_id, present}] */
export async function saveAttendance(meetingId, entries) {
  const session = await getSession();
  const rows = entries.map((e) => ({
    meeting_id: meetingId,
    profile_id: e.profile_id,
    present: e.present,
    recorded_by: session.user.id,
    recorded_at: new Date().toISOString(),
  }));
  const { error } = await db()
    .from('meeting_attendance')
    .upsert(rows, { onConflict: 'meeting_id,profile_id' });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Reports (RLS-scoped aggregates)                                     */
/* ------------------------------------------------------------------ */

export async function getReports() {
  // Resilient: one failed analytics RPC renders as an empty widget, not a
  // dead Reports page (audit fix, Phase 88).
  const soft = (name, args) => appRpc(name, args).catch(() => null);
  const [membership, growth, recruitment, tasks, meetings, coverage] =
    await Promise.all([
      soft('report_membership', {}),
      soft('report_monthly_growth', { months: 6 }),
      soft('report_recruitment', {}),
      soft('report_tasks', { days: 30 }),
      soft('report_meetings', { days: 30 }),
      soft('report_leadership_coverage', {}),
    ]);
  return { membership, growth, recruitment, tasks, meetings, coverage };
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const ANN_COLUMNS =
  'id, title, body, org_unit_id, network, priority, audience, author_id, ' +
  'created_at, ' +
  'author:profiles!announcements_author_id_fkey(id, first_name, last_name)';

export async function listAnnouncements(opts = {}) {
  const { page = 0, pageSize = 20 } = opts;
  const session = await getSession();
  const [{ data, error, count }, readsRes] = await Promise.all([
    db().from('announcements')
      .select(ANN_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1),
    db().from('announcement_reads')
      .select('announcement_id')
      .eq('profile_id', session.user.id),
  ]);
  if (error) throw error;
  if (readsRes.error) throw readsRes.error;
  const readSet = new Set(readsRes.data.map((r) => r.announcement_id));
  return {
    rows: data.map((a) => ({ ...a, read: readSet.has(a.id) })),
    total: count ?? 0,
  };
}

export async function postAnnouncement(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('announcements')
    .insert({
      title: fields.title,
      body: fields.body,
      org_unit_id: fields.org_unit_id,
      network: fields.network || null,
      priority: fields.priority,
      audience: fields.audience || 'all',
      author_id: session.user.id,
    })
    .select(ANN_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function markAnnouncementRead(annId) {
  const session = await getSession();
  const { error } = await db()
    .from('announcement_reads')
    .upsert({ announcement_id: annId, profile_id: session.user.id },
      { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true });
  if (error) throw error;
}

export const getAnnouncementReach = (annId) =>
  appRpc('announcement_reach', { ann_id: annId });

/* ------------------------------------------------------------------ */
/* Personal dashboard ("my day")                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* System health: does the database match this build?                  */
/* ------------------------------------------------------------------ */

/** The migration number this build of the app requires. Bump with every
 *  new migration; the shell warns HQ when the database is behind. */
export const EXPECTED_SCHEMA_VERSION = 172;
export const APP_VERSION = '85.8';

export async function getSchemaStatus() {
  try {
    const { data, error } = await db()
      .from('schema_migrations')
      .select('version, name, applied_at')
      .order('version');
    if (error) throw error;
    const applied = new Set(data.map((r) => r.version));
    const missing = [];
    for (let v = 1; v <= EXPECTED_SCHEMA_VERSION; v += 1) {
      if (!applied.has(v)) missing.push(v);
    }
    return { known: true, applied: data, missing };
  } catch {
    // Table absent = migration 011 itself not applied yet.
    return { known: false, applied: [], missing: [EXPECTED_SCHEMA_VERSION] };
  }
}

/* ------------------------------------------------------------------ */
/* Module access (HQ-controlled workspaces)                            */
/* ------------------------------------------------------------------ */

export async function getMyModules() {
  const { data, error } = await db().rpc('my_modules');
  if (error) throw error;
  return new Set(data.map((r) => (typeof r === 'string' ? r : r.my_modules)));
}

export async function listModuleAccess() {
  const { data, error } = await db()
    .from('module_access').select('role, module');
  if (error) throw error;
  return data;
}

export async function setModuleAccess(role, module, enabled) {
  if (enabled) {
    const { error } = await db()
      .from('module_access').upsert({ role, module },
        { onConflict: 'role,module', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await db()
      .from('module_access').delete().eq('role', role).eq('module', module);
    if (error) throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Programmes & beneficiaries                                          */
/* ------------------------------------------------------------------ */

export async function listProgrammes() {
  const { data, error } = await db()
    .from('programmes')
    .select('id, code, name, description, network, is_active')
    .eq('is_active', true)
    .order('code');
  if (error) throw error;
  return data;
}

export async function updateProgramme(id, patch) {
  const allowed = ['name', 'description', 'network', 'is_active'];
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const { data, error } = await db()
    .from('programmes').update(clean).eq('id', id)
    .select('id, code, name, description, network, is_active').single();
  if (error) throw error;
  return data;
}

const EVENT_COLUMNS =
  'id, programme_id, org_unit_id, title, event_date, location, notes, ' +
  'created_by, created_at';

export async function listProgrammeEvents(programmeId, opts = {}) {
  const { page = 0, pageSize = 20 } = opts;
  const { data, error, count } = await db()
    .from('programme_events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .eq('programme_id', programmeId)
    .order('event_date', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function createProgrammeEvent(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('programme_events')
    .insert({
      programme_id: fields.programme_id,
      org_unit_id: fields.org_unit_id,
      title: fields.title,
      event_date: fields.event_date,
      location: fields.location || null,
      notes: fields.notes || null,
      created_by: session.user.id,
    })
    .select(EVENT_COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function listBeneficiaries(search = '') {
  let q = db()
    .from('beneficiaries')
    .select('id, full_name, age_band, org_unit_id, notes, created_at')
    .order('full_name')
    .limit(15);
  if (search) {
    const s = search.replaceAll('%', '').replaceAll(',', '');
    q = q.ilike('full_name', `%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addBeneficiary(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('beneficiaries')
    .insert({
      full_name: fields.full_name,
      age_band: fields.age_band,
      org_unit_id: fields.org_unit_id,
      notes: fields.notes || null,
      created_by: session.user.id,
    })
    .select('id, full_name, age_band, org_unit_id, notes, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listServices(eventId) {
  const { data, error } = await db()
    .from('service_records')
    .select('id, service, outcome, recorded_at, ' +
      'who:beneficiaries!service_records_beneficiary_id_fkey' +
      '(id, full_name, age_band)')
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addService(eventId, beneficiaryId, service, outcome) {
  const session = await getSession();
  const { error } = await db()
    .from('service_records')
    .insert({
      event_id: eventId,
      beneficiary_id: beneficiaryId,
      service,
      outcome: outcome || null,
      recorded_by: session.user.id,
    });
  if (error) throw error;
}

export async function listVolunteerApps() {
  const { data, error } = await db().from('volunteer_applications')
    .select('id, full_name, email, phone, network, country, payload, status, created_at')
    .in('status', ['submitted', 'under_review'])
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}
export const decideVolunteer = (vid, approve, unit, reason) =>
  appRpc('decide_volunteer', { vid, approve, unit, reason });

export const getProgrammeImpact = () => appRpc('report_programmes', {});

/* ------------------------------------------------------------------ */
/* Cases (welfare, complaints, safeguarding) — confidential            */
/* ------------------------------------------------------------------ */

const CASE_COLUMNS =
  'id, case_no, category, org_unit_id, subject, details, reporter_id, ' +
  'status, created_at, updated_at';

export async function fileCase(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('cases')
    .insert({
      category: fields.category,
      org_unit_id: fields.org_unit_id || null,
      subject: fields.subject,
      details: fields.details,
      reporter_id: session.user.id,
    })
    .select(CASE_COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function listCases(opts = {}) {
  const { status = '', page = 0, pageSize = 25 } = opts;
  let q = db()
    .from('cases')
    .select(CASE_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function getCase(id) {
  const { data, error } = await db()
    .from('cases').select(CASE_COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listCaseUpdates(caseId) {
  const { data, error } = await db()
    .from('case_updates')
    .select('id, note, visible_to_reporter, created_at, author_id')
    .eq('case_id', caseId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export const assignCaseHandler = (caseId, handlerId) =>
  appRpc('assign_case_handler', { cid: caseId, handler: handlerId });

export const updateCaseStatus = (caseId, status, note, visible) =>
  appRpc('update_case_status',
    { cid: caseId, new_status: status, note, visible });

/* ------------------------------------------------------------------ */
/* Helpdesk                                                            */
/* ------------------------------------------------------------------ */

const TICKET_COLUMNS =
  'id, ticket_no, category, priority, subject, details, requester_id, ' +
  'assigned_to, status, resolved_at, created_at, updated_at';

export async function fileTicket(fields) {
  const session = await getSession();
  const { data, error } = await db()
    .from('tickets')
    .insert({
      category: fields.category,
      priority: fields.priority,
      subject: fields.subject,
      details: fields.details,
      requester_id: session.user.id,
    })
    .select(TICKET_COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function listTickets(opts = {}) {
  const { status = '', page = 0, pageSize = 25 } = opts;
  let q = db()
    .from('tickets')
    .select(TICKET_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function getTicket(id) {
  const { data, error } = await db()
    .from('tickets').select(TICKET_COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listTicketMessages(ticketId) {
  const { data, error } = await db()
    .from('ticket_messages')
    .select('id, author_id, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addTicketMessage(ticketId, body) {
  const session = await getSession();
  const { error } = await db()
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, author_id: session.user.id, body });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Staff messages (HQ)                                                 */
/* ------------------------------------------------------------------ */

export async function listStaffMessages() {
  const session = await getSession();
  const me = session.user.id;
  const { data, error } = await db()
    .from('staff_messages')
    .select('id, sender_id, recipient_id, body, read_at, created_at, ' +
      'attachment_path, attachment_name')
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return { rows: data, myId: me };
}

export async function sendStaffMessage(recipientId, body, file = null) {
  const session = await getSession();
  let attachment_path = null;
  let attachment_name = null;
  if (file) {
    attachment_path = `${session.user.id}/${crypto.randomUUID()}`;
    attachment_name = file.name.slice(0, 200);
    const { error: upErr } = await db().storage
      .from('staff-files')
      .upload(attachment_path, file, {
        contentType: file.type || 'application/octet-stream',
      });
    if (upErr) throw upErr;
  }
  const { error } = await db()
    .from('staff_messages')
    .insert({ sender_id: session.user.id, recipient_id: recipientId,
      body, attachment_path, attachment_name });
  if (error) throw error;
}

export async function staffFileUrl(path) {
  const { data, error } = await db().storage.from('staff-files')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}


/** Server-computed labels for everyone I share messages with.
 *  Members see HQ-side counterparts as 'WODDI HQ' (verified). */
export const messageIdentities = () =>
  appRpc('message_identities', {}).catch(() => []);

/** Recipient picker: HQ sees staff + field members; members see WODDI HQ. */
export const searchMessageRecipients = (s) =>
  appRpc('search_message_recipients', { s: s || '' });

/** Where a member's fresh message goes (master account first). */
export const hqInboxTarget = () =>
  appRpc('hq_inbox_target', {}).catch(() => null);

/* ------------------------------------------------------------------ */
/* 14-day activation: system verification (Phase 89)                   */
/* ------------------------------------------------------------------ */

/** What the system can already verify for me (CV, module, message…). */
export const journeySignals = () =>
  appRpc('journey_signals', {}).catch(() => ({}));

/** Fire-and-forget page-visit evidence; no-ops without a live journey. */
export const logJourneyEvent = (code) =>
  appRpc('log_journey_event', { p_code: code }).catch(() => {});

/** Upload my CV to private storage and record it (system-ticked). */
export async function uploadMemberCv(file) {
  const session = await getSession();
  const path = `${session.user.id}/${crypto.randomUUID()}-`
    + String(file.name || 'cv').replaceAll('/', '_').slice(0, 120);
  const { error } = await db().storage.from('member-cvs')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  await appRpc('record_cv_upload', { p_path: path, p_name: file.name || 'cv' });
  return path;
}

/** HQ signed link to a member's CV. */
export async function memberCvUrl(path) {
  const { data, error } = await db().storage.from('member-cvs')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** HQ-only: the org chart for one country — who holds each seat. */
export const orgChartCountry = (iso) => appRpc('org_chart_country', { iso });
export const orgChartCountries = () => appRpc('org_chart_countries', {});

/** HQ-only: everyone who passed activation and isn't yet a leader. */
export const promotionCandidates = () => appRpc('promotion_candidates', {});
export const vacantSeatsFor = (iso) => appRpc('vacant_seats_for', { iso });
export const promoteCandidate = (pid, targetUnit, targetRole) =>
  appRpc('promote_candidate',
    { pid, target_unit: targetUnit, target_role: targetRole });

/** Item 7 — nominate a leader for volunteer-spotlight recognition. */
export const submitSpotlightNomination = (fields) =>
  appRpc('submit_spotlight_nomination', {
    p_category: fields.category, p_nominee: fields.nomineeId,
    p_contribution: fields.contribution, p_evidence: fields.evidence,
    p_period_start: fields.periodStart || null,
    p_period_end: fields.periodEnd || null,
    p_other_contributors: fields.otherContributors || '',
    p_mission_note: fields.missionNote || '' });

/** HQ-only: the established leadership atlas. */
export const leadersAtlas = () => appRpc('leaders_atlas', {});

/** Phase 108 — end or reactivate a leader's seat, with the leader
 *  notified (notice + email) as the UAT committee required. */
/** Phase 111 — network volunteer registration via RPC so the success
 *  screen can state the reference number and network track. */
export const submitVolunteerReg = ({ fullName, email, phone, network,
  country, about, state, locale, ref, birthDate }) =>
  appRpc('submit_volunteer_reg', {
    p_full_name: fullName, p_email: email, p_phone: phone,
    p_network: network, p_country: country, p_about: about,
    p_state: state || null, p_locale: locale || null, p_ref: ref || null,
    p_birth_date: birthDate || null });

export const setLeaderAppointment = (assignmentId, action, reason) =>
  appRpc('set_leader_appointment',
    { p_assignment: assignmentId, p_action: action, p_reason: reason });

/** HQ-only: the 14-day activation accountability table. */
export const activationReport = () => appRpc('activation_report', {});
/* Phase 218: the candidates who passed the 14-Day Activation, with contact
   details, for the PDF / CSV / Excel downloads on Reports. HQ only. */
export const activationPassedExport = () => appRpc('activation_passed_export', {});

/** HQ-only: one candidate's full day-by-day report + recommendation —
 *  only meaningful once her journey has actually concluded. */
export const activationIndividualReport = (journeyId) =>
  appRpc('activation_individual_report', { jid: journeyId });

export async function markMessageRead(id) {
  const { error } = await db()
    .from('staff_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** HQ root unit id (for staff tasks and HQ meetings). */
export async function getHqUnitId() {
  const { data, error } = await db()
    .from('org_units').select('id').eq('level', 'headquarters').single();
  if (error) throw error;
  return data.id;
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export async function listDocFolders(parentId) {
  let q = db().from('doc_folders')
    .select('id, name, parent_id, org_unit_id')
    .order('name');
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createDocFolder(fields) {
  const session = await getSession();
  const { error } = await db().from('doc_folders').insert({
    name: fields.name, parent_id: fields.parent_id,
    org_unit_id: fields.org_unit_id, created_by: session.user.id });
  if (error) throw error;
}

export async function listDocuments(folderId, includeArchived) {
  let q = db().from('documents')
    .select('id, name, path, mime, archived, created_at')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false });
  if (!includeArchived) q = q.eq('archived', false);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function uploadDocument(folderId, file) {
  const session = await getSession();
  const path = crypto.randomUUID();
  const { error: upErr } = await db().storage.from('documents')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream' });
  if (upErr) throw upErr;
  const { error } = await db().from('documents').insert({
    folder_id: folderId, name: file.name.slice(0, 200), path,
    mime: file.type || null, uploaded_by: session.user.id });
  if (error) throw error;
}

export async function setDocumentArchived(id, archived) {
  const { error } = await db().from('documents')
    .update({ archived }).eq('id', id);
  if (error) throw error;
}

export function documentUrl(path) {
  const { supabaseUrl } = getConfig();
  return `${supabaseUrl}/storage/v1/object/public/documents/${path}`;
}

/* ------------------------------------------------------------------ */
/* Global search                                                       */
/* ------------------------------------------------------------------ */

export async function globalSearch(qtext) {
  const s = qtext.replaceAll('%', '').replaceAll(',', '').trim();
  if (!s) return { members: [], tasks: [], tickets: [] };
  const like = `%${s}%`;
  const [members, tasks, tickets] = await Promise.all([
    db().from('field_members')
      .select('id, first_name, last_name, membership_no')
      .or(`first_name.ilike.${like},last_name.ilike.${like},` +
          `membership_no.ilike.${like}`)
      .limit(6).then((r) => r.data ?? []),
    db().from('tasks').select('id, title, status')
      .ilike('title', like).limit(6).then((r) => r.data ?? []),
    db().from('tickets').select('id, ticket_no, subject')
      .or(`subject.ilike.${like},ticket_no.ilike.${like}`)
      .limit(6).then((r) => r.data ?? []),
  ]);
  return { members, tasks, tickets };
}

/* ------------------------------------------------------------------ */
/* Activation journey (FRD B)                                          */
/* ------------------------------------------------------------------ */

export async function listActivationMilestones() {
  const { data, error } = await db()
    .from('activation_milestones')
    .select('id, seq, code, name, day_target, is_required, self_service')
    .eq('is_active', true)
    .order('seq');
  if (error) throw error;
  return data;
}

export async function getJourney(profileId) {
  const { data, error } = await db()
    .from('activation_journeys')
    .select('id, profile_id, status, started_at, due_at, extended_until, ' +
      'completed_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getJourneyProgress(journeyId) {
  const { data, error } = await db()
    .from('activation_progress')
    .select('milestone_id, completed_at, note')
    .eq('journey_id', journeyId);
  if (error) throw error;
  return data;
}

export const completeMilestone = (journeyId, milestoneId, note) =>
  appRpc('complete_milestone', { jid: journeyId, mid: milestoneId,
    p_note: note || null });

export const extendActivation = (journeyId, until, reason) =>
  appRpc('extend_activation', { jid: journeyId, until, reason });

export const startActivation = (profileId) =>
  appRpc('start_activation', { pid: profileId });

/* ------------------------------------------------------------------ */
/* Activation content (Phase 33) — the 14-day curriculum & scoring     */
/* ------------------------------------------------------------------ */

export async function getActivationDays() {
  const { data, error } = await db()
    .from('activation_days')
    .select('id, day, title, kind, intro, is_gate')
    .eq('is_active', true)
    .order('day');
  if (error) throw error;
  return data;
}

export async function getActivationItems(day) {
  const { data, error } = await db()
    .from('activation_items')
    .select('id, day, seq, kind, prompt, options, points, is_required')
    .eq('day', day)
    .order('seq');
  if (error) throw error;
  return data;
}

export async function getAllActivationItems() {
  const { data, error } = await db()
    .from('activation_items')
    .select('id, day, seq, kind, prompt, options, points, is_required')
    .order('day').order('seq');
  if (error) throw error;
  return data;
}

export async function getMyResponses(journeyId) {
  const { data, error } = await db()
    .from('activation_item_responses')
    .select('item_id, answer, is_correct, score, submitted_at')
    .eq('journey_id', journeyId);
  if (error) throw error;
  return data;
}

export const submitActivationItem = (journeyId, itemId, answer) =>
  appRpc('submit_activation_item', { jid: journeyId, iid: itemId, ans: answer });

export const getActivationSummary = (journeyId) =>
  appRpc('activation_summary', { jid: journeyId });

/* ------------------------------------------------------------------ */
/* Engagement library (Phase 33) — the ongoing content rhythm          */
/* ------------------------------------------------------------------ */

export async function listEngagement(kind) {
  const { data, error } = await db()
    .from('engagement_content')
    .select('id, kind, period, title, focus, body')
    .eq('kind', kind)
    .eq('is_active', true)
    .order('period');
  if (error) throw error;
  return data;
}

export async function getEngagementFor(kind, period) {
  const { data, error } = await db()
    .from('engagement_content')
    .select('id, kind, period, title, focus, body')
    .eq('kind', kind)
    .eq('period', period)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Message & response library (FRD K)                                  */
/* ------------------------------------------------------------------ */

const TEMPLATE_COLUMNS =
  'id, code, locale, category, name, subject, body, status, version, ' +
  'updated_at';

export async function listMessageTemplates(category = '', locale = 'en') {
  let q = db()
    .from('message_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('locale', locale)
    .order('category').order('name');
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateMessageTemplate(id, patch) {
  const { data, error } = await db()
    .from('message_templates')
    .update({ subject: patch.subject, body: patch.body })
    .eq('id', id)
    .select(TEMPLATE_COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function approveMessageTemplate(id) {
  const { data, error } = await db()
    .from('message_templates')
    .update({ status: 'approved' })
    .eq('id', id)
    .select(TEMPLATE_COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function createTemplateLocale(enTemplate, locale) {
  const { error } = await db()
    .from('message_templates')
    .insert({
      code: enTemplate.code,
      locale,
      category: enTemplate.category,
      name: enTemplate.name,
      subject: enTemplate.subject,
      body: enTemplate.body,
    });
  if (error && !String(error.message).includes('duplicate')) throw error;
}

/** Replace {tokens} with values; unknown tokens stay literal. */
export function fillTemplate(text, ctx) {
  return String(text ?? '').replace(/\{([a-z_]+)\}/g,
    (m, k) => (ctx[k] ?? m));
}

/* ------------------------------------------------------------------ */
/* Account security                                                    */
/* ------------------------------------------------------------------ */

export async function changePassword(newPassword) {
  const { error } = await db().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  return appRpc('request_password_reset', { em: email });
}

export const completePasswordReset = (tk, newpw) =>
  appRpc('complete_password_reset', { tk, newpw });

/* ------------------------------------------------------------------ */
/* Task checklists & files                                             */
/* ------------------------------------------------------------------ */

export async function listChecklist(taskId) {
  const { data, error } = await db()
    .from('task_checklist_items')
    .select('id, label, done, done_at, seq')
    .eq('task_id', taskId)
    .order('seq').order('created_at');
  if (error) throw error;
  return data;
}

export async function addChecklistItem(taskId, label) {
  const session = await getSession();
  const { error } = await db()
    .from('task_checklist_items')
    .insert({ task_id: taskId, label, created_by: session.user.id });
  if (error) throw error;
}

export async function toggleChecklistItem(id, done) {
  const session = await getSession();
  const { error } = await db()
    .from('task_checklist_items')
    .update({
      done,
      done_by: done ? session.user.id : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function listTaskFiles(taskId) {
  const { data, error } = await db()
    .from('task_files')
    .select('id, path, name, created_at')
    .eq('task_id', taskId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addTaskFile(taskId, file) {
  const session = await getSession();
  const path = crypto.randomUUID();
  const { error: upErr } = await db().storage
    .from('task-files')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
    });
  if (upErr) throw upErr;
  const { error } = await db()
    .from('task_files')
    .insert({ task_id: taskId, path, name: file.name.slice(0, 200),
      uploaded_by: session.user.id });
  if (error) throw error;
}

export async function taskFileUrl(path) {
  // task-files is a private bucket (migration 046): short-lived signed URLs
  const { data, error } = await db().storage.from('task-files')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ------------------------------------------------------------------ */
/* Task templates                                                      */
/* ------------------------------------------------------------------ */

export async function listTaskTemplates() {
  const { data, error } = await db()
    .from('task_templates')
    .select('id, name, title, details, priority, requires_approval, ' +
      'is_shared, created_by, tags')
    .order('name');
  if (error) throw error;
  return data;
}

export async function saveTaskTemplate(fields) {
  const session = await getSession();
  const { error } = await db()
    .from('task_templates')
    .insert({
      name: fields.name,
      title: fields.title,
      details: fields.details || null,
      tags: fields.tags || [],
      priority: fields.priority,
      requires_approval: fields.requires_approval,
      is_shared: fields.is_shared ?? false,
      created_by: session.user.id,
    });
  if (error) throw error;
}

export async function deleteTaskTemplate(id) {
  const { error } = await db()
    .from('task_templates').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Task comments & mentions                                            */
/* ------------------------------------------------------------------ */

export async function listTaskComments(taskId) {
  const { data, error } = await db()
    .from('task_comments')
    .select('id, body, created_at, ' +
      'author:profiles!task_comments_author_id_fkey(first_name, last_name)')
    .eq('task_id', taskId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function countTaskComments(taskId) {
  const { count, error } = await db()
    .from('task_comments')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);
  if (error) throw error;
  return count ?? 0;
}

export async function addTaskComment(taskId, body, mentionIds = []) {
  const session = await getSession();
  const { data, error } = await db()
    .from('task_comments')
    .insert({ task_id: taskId, author_id: session.user.id, body })
    .select('id').single();
  if (error) throw error;
  if (mentionIds.length > 0) {
    const { error: mErr } = await db()
      .from('task_comment_mentions')
      .insert(mentionIds.map((pid) => ({
        comment_id: data.id, profile_id: pid })));
    if (mErr) throw mErr;
  }
}

/** People the current user may see (self, territory, staff peers, HQ). */
export async function searchMentionables(search) {
  let q = db()
    .from('profiles')
    .select('id, first_name, last_name')
    .order('first_name')
    .limit(8);
  if (search) {
    const s = search.replaceAll('%', '').replaceAll(',', '');
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export const assignTicket = (ticketId, officerId) =>
  appRpc('assign_ticket', { tid: ticketId, officer: officerId });

export const setTicketStatus = (ticketId, status) =>
  appRpc('set_ticket_status', { tid: ticketId, new_status: status });

/* ------------------------------------------------------------------ */
/* Headquarters Operations                                             */
/* ------------------------------------------------------------------ */

export async function listDepartments() {
  const { data, error } = await db()
    .from('departments')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export async function listStaff() {
  const { data, error } = await db()
    .from('staff')
    .select('profile_id, department_id, position_title, reports_to, ' +
      'person:profiles!staff_profile_id_fkey(id, first_name, last_name, email)')
    .eq('is_active', true)
    .order('position_title');
  if (error) throw error;
  return data;
}

export async function addStaff(fields) {
  const { error } = await db()
    .from('staff')
    .insert({
      profile_id: fields.profile_id,
      department_id: fields.department_id,
      position_title: fields.position_title,
      reports_to: fields.reports_to,
    });
  if (error) throw error;
}

const SREPORT_COLUMNS =
  'id, author_id, report_date, period, tasks_completed, tasks_in_progress, ' +
  'challenges, support_required, next_priorities, status, reviewer_id, ' +
  'reviewer_note, reviewed_at, created_at, ' +
  'author:profiles!staff_reports_author_id_fkey(id, first_name, last_name)';

export async function listStaffReports(opts = {}) {
  const { mine = false, status = '', excludeAuthor = '', pageSize = 25 } = opts;
  const session = await getSession();
  let q = db()
    .from('staff_reports')
    .select(SREPORT_COLUMNS)
    .order('report_date', { ascending: false })
    .limit(pageSize);
  if (mine) q = q.eq('author_id', session.user.id);
  if (status) q = q.eq('status', status);
  if (excludeAuthor) q = q.neq('author_id', excludeAuthor);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function submitStaffReport(fields) {
  const session = await getSession();
  const { error } = await db()
    .from('staff_reports')
    .insert({
      author_id: session.user.id,
      report_date: fields.report_date,
      period: fields.period,
      tasks_completed: fields.tasks_completed,
      tasks_in_progress: fields.tasks_in_progress || null,
      challenges: fields.challenges || null,
      support_required: fields.support_required || null,
      next_priorities: fields.next_priorities || null,
    });
  if (error) throw error;
}

export async function updateStaffReport(id, patch) {
  const allowed = ['tasks_completed', 'tasks_in_progress', 'challenges',
    'support_required', 'next_priorities', 'status'];
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const { data, error } = await db()
    .from('staff_reports').update(clean).eq('id', id)
    .select(SREPORT_COLUMNS).single();
  if (error) throw error;
  return data;
}

export const reviewStaffReport = (id, approve, note) =>
  appRpc('review_staff_report', { rid: id, approve, note });

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

export function avatarUrl(profileId, bust = '') {
  const { supabaseUrl } = getConfig();
  return `${supabaseUrl}/storage/v1/object/public/avatars/${profileId}` +
    (bust ? `?v=${bust}` : '');
}

export async function uploadAvatar(profileId, file) {
  const { error } = await db().storage
    .from('avatars')
    .upload(profileId, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
      cacheControl: '300',
    });
  if (error) throw error;
}

export async function getMyDay() {
  const session = await getSession();
  const me = session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString();
  const nowIso = new Date().toISOString();

  const head = (table, build) => {
    // Count with '*': announcement_reads has no 'id' column, and head
    // counts never fetch data anyway.
    let q = db().from(table).select('*', { count: 'exact', head: true });
    return build(q).then(({ count, error }) => {
      if (error) throw error;
      return count ?? 0;
    });
  };

  const [myOpen, myOverdue, reviewQueue, openApps, meetingsWeek,
    annTotal, annRead] = await Promise.all([
    head('tasks', (q) => q.eq('assigned_to', me)
      .in('status', ['not_started', 'in_progress'])),
    head('tasks', (q) => q.eq('assigned_to', me)
      .in('status', ['not_started', 'in_progress', 'awaiting_review'])
      .not('due_on', 'is', null).lt('due_on', today)),
    head('tasks', (q) => q.eq('status', 'awaiting_review')
      .neq('assigned_to', me)),
    head('applications', (q) => q.in('status',
      ['submitted', 'under_review', 'recommended'])),
    head('meetings', (q) => q.eq('status', 'scheduled')
      .gte('starts_at', nowIso).lte('starts_at', weekAhead)),
    head('announcements', (q) => q),
    head('announcement_reads', (q) => q.eq('profile_id', me)),
  ]);

  return {
    myOpen, myOverdue, reviewQueue, openApps, meetingsWeek,
    annUnread: Math.max(0, annTotal - annRead),
  };
}

/* ------------------------------------------------------------------ */
/* Smart automation (Phase 35)                                         */
/* ------------------------------------------------------------------ */

export async function listAutomationRules() {
  const { data, error } = await db()
    .from('automation_rules')
    .select('code, threshold_days, is_active, last_run_at, last_matches')
    .order('code');
  if (error) throw error;
  return data;
}

export async function updateAutomationRule(code, patch) {
  const { error } = await db()
    .from('automation_rules').update(patch).eq('code', code);
  if (error) throw error;
}

export async function listAutomationEvents(limit = 12) {
  const { data, error } = await db()
    .from('automation_events')
    .select('rule_code, fired_at, matches, notified')
    .order('fired_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export const runAutomations = () => appRpc('run_automations_guarded', {});
export const getAutomationInsights = () => appRpc('automation_insights', {});

/* ------------------------------------------------------------------ */
/* Member notices + profile self-edit (Phase 36)                       */
/* ------------------------------------------------------------------ */

export async function getMyNotices(limit = 8) {
  const { data, error } = await db()
    .from('member_notices')
    .select('id, kind, title, body, meta, created_at, read_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function markNoticeRead(id) {
  const { error } = await db()
    .from('member_notices')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/* Phase 218: a profile form saves only what the person actually changed.
   Before this, every Save sent every box, so a box that opened empty (the
   value was not loaded, or was not one of the dropdown options) wiped the
   stored value: 70 positions and dozens of countries, states and LGAs were
   lost that way in August. The database now refuses such wipes too
   (migration 170), but the form should never try. */
const normField = (v) => (v === null || v === undefined ? '' : String(v).trim());
export function changedFields(before, patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (normField(v) !== normField(before ? before[k] : undefined)) out[k] = v;
  }
  return out;
}
export async function saveMyProfileChanges(before, patch) {
  const diff = changedFields(before, patch);
  if (Object.keys(diff).length) await updateMyProfile(diff);
  return diff;
}

export async function updateMyProfile(patch) {
  const { data: { session } } = await db().auth.getSession();
  const { error } = await db()
    .from('profiles').update(patch).eq('id', session.user.id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Courses & certification (Phase 37)                                  */
/* ------------------------------------------------------------------ */

export async function listCourses() {
  const { data, error } = await db()
    .from('courses').select('id, code, title, description')
    .eq('is_active', true).order('code');
  if (error) throw error;
  return data;
}

export async function getCourseModules(courseId) {
  const { data, error } = await db()
    .from('course_modules')
    .select('id, seq, title, lesson')
    .eq('course_id', courseId).order('seq');
  if (error) throw error;
  return data;
}

export async function getModuleQuestions(moduleId) {
  const { data, error } = await db()
    .from('course_questions')
    .select('id, seq, prompt, options')
    .eq('module_id', moduleId).order('seq');
  if (error) throw error;
  return data;
}

export async function getMyEnrollments() {
  const { data, error } = await db()
    .from('course_enrollments')
    .select('id, course_id, started_at, completed_at, cert_no');
  if (error) throw error;
  return data;
}

export async function getMyModulePasses(enrollmentId) {
  const { data, error } = await db()
    .from('course_module_passes')
    .select('module_id, score, total, passed, completed_at')
    .eq('enrollment_id', enrollmentId);
  if (error) throw error;
  return data;
}

export const enrollCourse = (courseId) =>
  appRpc('enroll_course', { cid: courseId });
export const submitCourseModule = (enrollmentId, moduleId, answers) =>
  appRpc('submit_course_module', { eid: enrollmentId, mid: moduleId, answers });
export const getCourseStats = () => appRpc('course_stats', {});
export const teamAccountability = () => appRpc('team_accountability', {});
export const peopleAnalytics = () => appRpc('people_analytics', {});
export const countryMemberStats = () => appRpc('country_member_stats', {});
export const programmeState = () => appRpc('programme_state', {});
export const getAiToken = () => appRpc('get_ai_token', {});
export const leadershipOverview = () => appRpc('leadership_overview', {});
export const setAiToken = (tok) => appRpc('set_ai_token', { tok });
export const meetingJoin = (mid) => appRpc('meeting_join', { mid });

export async function listCheckins(mid) {
  const { data, error } = await db().from('meeting_checkins')
    .select('profile_id, joined_at, profile:profiles(id, first_name, last_name, org_unit_id)')
    .eq('meeting_id', mid).order('joined_at');
  if (error) throw error;
  return data;
}

export async function uploadMeetingFile(mid, file) {
  const path = `${mid}/${crypto.randomUUID()}-${file.name.slice(0, 80)}`;
  const { error } = await db().storage.from('meeting-files')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { error: e2 } = await db().from('meeting_files')
    .insert({ meeting_id: mid, name: file.name.slice(0, 200), path });
  if (e2) throw e2;
}

export async function listMeetingFiles(mid) {
  const { data, error } = await db().from('meeting_files')
    .select('id, name, path').eq('meeting_id', mid).order('created_at');
  if (error) throw error;
  return data;
}

export async function meetingFileUrl(path) {
  const { data, error } = await db().storage.from('meeting-files')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveMeetingMinutes(mid, text) {
  const { error } = await db().from('meetings')
    .update({ minutes: text.slice(0, 8000) }).eq('id', mid);
  if (error) throw error;
}

export async function msgFileUrl(path) {
  const { data, error } = await db().storage.from('staff-files')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadMsgFile(file) {
  const path = `${crypto.randomUUID()}-${(file.name || 'audio.webm').slice(0, 80)}`;
  const { error } = await db().storage.from('staff-files')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: (file.name || 'Voice message').slice(0, 200) };
}

export const announceGroupCall = (room, aud) =>
  appRpc('announce_group_call', { room, aud });

/* ------------------------------------------------------------------ */
/* Org settings (Phase 38)                                             */
/* ------------------------------------------------------------------ */

export async function getOrgSetting(key) {
  const { data, error } = await db()
    .from('org_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

export async function setOrgSetting(key, value) {
  const { error } = await db()
    .from('org_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Email layer (Phase 39)                                              */
/* ------------------------------------------------------------------ */

export const setEmailSecret = (key, value) =>
  appRpc('set_email_secret', { k: key, v: value });
export const getEmailStatus = () => appRpc('get_email_status', {});

/** Phase 106 — Institute Outreach: the 46-organisation invitation list. */
export const outreachSummary = () => appRpc('outreach_summary', {});
export const sendOutreachBatch = (limit = 20) =>
  appRpc('send_outreach_batch', { p_limit: limit });
export const sendOutreachOne = (id) =>
  appRpc('send_outreach_one', { p_id: id });
export const setOutreachStatus = (id, status, newEmail) =>
  appRpc('set_outreach_status',
    { p_id: id, p_status: status, p_new_email: newEmail || null });
export const sendTestEmail = () => appRpc('send_test_email', {});

/* ------------------------------------------------------------------ */
/* Content Studio (Phase 40) — HQ curriculum editing                   */
/* ------------------------------------------------------------------ */

async function upd(table, id, patch) {
  const { error } = await db().from(table).update(patch).eq('id', id);
  if (error) throw error;
}
export const updateActivationDay = (id, patch) => upd('activation_days', id, patch);
export const updateActivationItem = (id, patch) => upd('activation_items', id, patch);
export const updateEngagement = (id, patch) => upd('engagement_content', id, patch);
export const updateCourseModule = (id, patch) => upd('course_modules', id, patch);
export const updateCourseQuestion = (id, patch) => upd('course_questions', id, patch);

export async function getActivationKeys() {          // HQ RLS gates this
  const { data, error } = await db()
    .from('activation_keys').select('item_id, correct');
  if (error) throw error;
  return data;
}
export async function setActivationKey(itemId, correct) {
  const { error } = await db().from('activation_keys')
    .upsert({ item_id: itemId, correct });
  if (error) throw error;
}
export async function getCourseKeys() {              // HQ RLS gates this
  const { data, error } = await db()
    .from('course_keys').select('question_id, correct');
  if (error) throw error;
  return data;
}
export async function setCourseKey(questionId, correct) {
  const { error } = await db().from('course_keys')
    .upsert({ question_id: questionId, correct });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Member hygiene (Phase 41)                                           */
/* ------------------------------------------------------------------ */

export const touchLastSeen = () =>
  appRpc('touch_last_seen', {}).catch(() => {});
export const findDuplicateProfiles = () =>
  appRpc('find_duplicate_profiles', {});
export const mergeProfiles = (keep, dropId, reason) =>
  appRpc('merge_profiles', { keep, drop_id: dropId, reason });

/* ------------------------------------------------------------------ */
/* UAT feedback (Phase 43)                                             */
/* ------------------------------------------------------------------ */

export async function submitUatFeedback(row) {
  const { data, error } = await db()
    .from('uat_feedback').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function listMyUatFeedback() {
  const { data: { session } } = await db().auth.getSession();
  const { data, error } = await db()
    .from('uat_feedback').select('*')
    .eq('reporter_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllUatFeedback(filters = {}) {
  let q = db().from('uat_feedback').select('*')
    .order('created_at', { ascending: false }).limit(400);
  if (filters.severity) q = q.eq('severity', filters.severity);
  if (filters.status) q = q.eq('triage_status', filters.status);
  if (filters.track) q = q.eq('track', filters.track);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateUatFeedback(id, patch) {
  const { error } = await db()
    .from('uat_feedback').update(patch).eq('id', id);
  if (error) throw error;
}

export const getUatSummary = () => appRpc('uat_summary', {});

export async function uploadUatEvidence(file) {
  const { data: { session } } = await db().auth.getSession();
  const path = `${session.user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
  const { error } = await db().storage.from('uat-evidence')
    .upload(path, file, { contentType: file.type || 'image/png' });
  if (error) throw error;
  return path;
}

export async function uatEvidenceUrl(path) {
  const { data, error } = await db().storage.from('uat-evidence')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ------------------------------------------------------------------ */
/* Claim account (Phase 44)                                            */
/* ------------------------------------------------------------------ */

export const claimCheck = (email) => appRpc('claim_check', { em: email });

export async function claimSignUp(email, password) {
  const { data, error } = await db().auth.signUp({ email, password });
  if (error) throw error;
  return data;
}


/* Ask WODDI (Phase 46) */
export async function listMyTasksBrief() {
  const { data: { session } } = await db().auth.getSession();
  const { data, error } = await db().from('tasks')
    .select('id, title, status, due_on')
    .eq('assigned_to', session.user.id)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(80);
  if (error) throw error;
  return data;
}


/* ------------------------------------------------------------------ */
/* Phase 131 — Volunteer Dashboard, Referrals, HQ account control     */
/* ------------------------------------------------------------------ */

/** The whole volunteer dashboard in one call. No argument = my own;
 *  a profile id = HQ "View as" (the server refuses non-HQ callers). */
export const volunteerHome = (pid) =>
  appRpc('volunteer_home', pid ? { pid } : {});

export async function submitReferral(row) {
  const { data, error } = await db().from('referrals')
    .insert({ ...row, consent: true })
    .select('id, ref_no, status, created_at').single();
  if (error) throw error;
  return data;
}

export async function listReferrals(opts = {}) {
  let q = db().from('referrals')
    .select('id, ref_no, referrer_id, category, country, state_region, lga, '
      + 'community, reason, details, status, assigned_to, hq_notes, '
      + 'org_unit_id, created_at, updated_at, '
      + 'referrer:profiles!referrals_referrer_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false }).limit(opts.limit || 100);
  if (opts.mine) q = q.eq('referrer_id', opts.mine);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export const setReferralStatus = (rid, status, assignee, notes) =>
  appRpc('set_referral_status', { rid, new_status: status,
    assignee: assignee || null, notes: notes || null });

/* HQ account control (profile/role side; the server checks is_case_hq) */
export const hqAccountList = (q, lim) =>
  appRpc('hq_account_list', { q: q || '', lim: lim || 300 });
export const hqUpdateProfile = (pid, patch) =>
  appRpc('hq_update_profile', { pid, patch });
export const hqSetStatus = (pid, status) =>
  appRpc('hq_set_status', { pid, target_status: status });
export const hqSetRole = (pid, role, unit, appt = 'appointed') =>
  appRpc('hq_set_role', { pid, new_role: role, unit, appt });
export const hqSetAppointment = (pid, appt) =>
  appRpc('hq_set_appointment', { pid, appt });

/* Phase 135 — Volunteer Leadership Structure */
export const structureExplorer = (f = {}) =>
  appRpc('structure_explorer', {
    p_net: f.net || 'WGMN', p_country: f.country || null, p_state: f.state || null,
    p_level: f.level || null, p_role: f.role || null,
    p_status: f.status || 'all', p_activation: f.activation || 'all',
    p_limit: f.limit || 600 });
export async function listLevelTerms() {
  const { data, error } = await db().from('level_terms').select('*').order('country_iso');
  if (error) throw error;
  return data;
}
export async function listPositions() {
  const { data, error } = await db().from('position_master').select('*').order('seq');
  if (error) throw error;
  return data;
}
/** The eight volunteer positions, in the founder's order (fallback when offline). */
export const POSITIONS = ['country_rep', 'deputy_country_rep', 'state_coordinator',
  'assistant_state_coordinator', 'district_coordinator', 'assistant_district_coordinator',
  'cluster_coordinator', 'assistant_cluster_coordinator', 'chapter_lead', 'assistant_chapter_lead'];
export const hqEndRoles = (pid) => appRpc('hq_end_roles', { pid });
export const hqLinkDirectory = (pid, code) =>
  appRpc('hq_link_directory', { pid, code });

/* Phase 213 — Edge Function calls that tell the truth about failures.
   Three different things used to come back as one message ("not deployed or
   not reachable"): the request never got an answer (a dropped connection),
   the function answered with an error, or the function does not exist. Now
   each is named, the browser's own reason is kept, and a call that is safe
   to repeat is retried when the connection dropped. */
function fnCause(error) {
  const c = error?.context;
  return String((c && (c.message || c.name)) || c || '').slice(0, 140);
}
export async function invokeFn(name, body, { retries = 0 } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 900 * attempt));
    const { data, error } = await db().functions.invoke(name, { body });
    if (!error) return { data, error: null };
    last = error;
    if (error.name !== 'FunctionsFetchError') break;          // the server answered: never repeat
    authLog('fn_no_answer', { fn: name, action: body?.action || null, cause: fnCause(error), attempt });
  }
  return { data: null, error: last };
}

/** HQ account control (auth side) via the admin-users Edge Function.
 *  Actions: ping, create, set_password, set_email, ban, delete, bulk_*.
 *  Errors carry e.code: unreachable (no answer; e.maybeDone when the action
 *  may have run), not_deployed (404), not_signed_in, hq_only, or the
 *  function's own code (email_exists, protected_account, ...). */
// Repeating these after a dropped connection gives the same end state
// (set_password: the newest temporary password shown is the valid one).
const ADMIN_SAFE_TO_REPEAT = new Set(['ping', 'set_password', 'set_email', 'ban']);
export async function adminUsers(action, fields = {}) {
  const { data, error } = await invokeFn('admin-users', { action, ...fields },
    { retries: ADMIN_SAFE_TO_REPEAT.has(action) ? 2 : 0 });
  if (error) {
    if (error.name === 'FunctionsFetchError') {
      const cause = fnCause(error);
      const maybeDone = action !== 'ping';
      const e = new Error(maybeDone
        ? `The connection dropped before WDOS heard back${cause ? ` (${cause})` : ''}, so this may already have been done. Refresh the list and check before trying again.`
        : `No answer from the account service${cause ? ` (${cause})` : ''}.`);
      e.code = 'unreachable'; e.cause = cause; e.maybeDone = maybeDone;
      throw e;
    }
    // The function (or the gateway) answered with an error status: read its reason
    const status = error.context?.status || 0;
    let code = ''; let detail = '';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        code = j?.error ? String(j.error) : ''; detail = j?.detail ? String(j.detail) : '';
        if (!code && (j?.code === 'NOT_FOUND' || /not found/i.test(j?.message || ''))) code = 'not_deployed';
      }
    } catch { /* body not JSON */ }
    if (!code && status === 404) code = 'not_deployed';
    if (!code && status === 401) code = 'not_signed_in';
    const e = new Error(code ? `${code}${detail ? ': ' + detail : ''}` : `${error.message || 'admin-users failed'} (HTTP ${status || '?'})`);
    e.code = code || `http_${status}`; e.status = status;
    throw e;
  }
  if (data && data.error) {
    const e = new Error(`${data.error}${data.detail ? ': ' + data.detail : ''}`);
    e.code = data.error;
    throw e;
  }
  return data;
}

export async function markAllAnnouncementsSeen(ids) {
  if (!ids || !ids.length) return;
  const { data: { session } } = await db().auth.getSession();
  const rows = ids.map((announcement_id) =>
    ({ announcement_id, profile_id: session.user.id }));
  await db().from('announcement_reads').upsert(rows,
    { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true });
}


/* ------------------------------------------------------------------ */
/* Phase 134 — Reporting & Accountability                              */
/* ------------------------------------------------------------------ */
export const reportOpen = (tpl, onDate, meetingId, eventId) =>
  appRpc('report_open', { tpl, on_date: onDate || null, p_meeting: meetingId || null, p_event: eventId || null });
export const reportGet = (rid) => appRpc('report_get', { rid });
export const reportSave = (rid, answers, evidence, nil, nilReason) =>
  appRpc('report_save', { rid, p_answers: answers, p_evidence: evidence ?? null,
    p_nil: nil ?? null, p_nil_reason: nilReason ?? null });
export const reportValidate = (rid) => appRpc('report_validate', { rid });
export const reportSubmit = (rid) => appRpc('report_submit', { rid });
export const reportReview = (rid, decision, note, createTasks = true) =>
  appRpc('report_review', { rid, decision, note: note || null, create_tasks: createTasks });
export const reportNewVersion = (rid) => appRpc('report_new_version', { rid });
export const reportingDashboard = () => appRpc('reporting_dashboard', {});
export const reportingCompliance = (root, period, net) =>
  appRpc('reporting_compliance', { p_root: root || null, p_period: period || null, p_net: net || 'WGMN' });
export const reportingList = (scope, status, limit) =>
  appRpc('reporting_list', { scope: scope || 'mine', p_status: status || null, p_limit: limit || 100 });
export const reportingRemindersRun = () => appRpc('reporting_reminders_run', {});
export async function listReportTemplates() {
  const { data, error } = await db().from('report_templates').select('*').eq('active', true).order('code');
  if (error) throw error;
  return data;
}
export async function addActivityRecord(row) {
  const { data, error } = await db().from('activity_records').insert(row).select('id, occurred_at').single();
  if (error) throw error;
  return data;
}
export async function listActivityRecords(opts = {}) {
  let q = db().from('activity_records')
    .select('*, who:profiles!activity_records_profile_id_fkey(first_name, last_name), unit:org_units(name)')
    .order('occurred_at', { ascending: false }).limit(opts.limit || 60);
  if (opts.mine) q = q.eq('profile_id', opts.mine);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function addIssue(row) {
  const { data, error } = await db().from('issues').insert(row).select('id, issue_no').single();
  if (error) throw error;
  return data;
}
export async function listIssues(opts = {}) {
  let q = db().from('issues')
    .select('*, unit:org_units(name), who:profiles!issues_profile_id_fkey(first_name, last_name)')
    .order('severity', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit || 100);
  if (opts.open) q = q.in('status', ['open', 'in_progress', 'awaiting_decision']);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function updateIssue(id, patch) {
  const { error } = await db().from('issues').update(patch).eq('id', id);
  if (error) throw error;
}
export async function uploadReportEvidence(reportId, file) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const path = `${reportId}/${Date.now()}_${safe}`;
  const { error } = await db().storage.from('report-evidence').upload(path, file, { upsert: false });
  if (error) throw error;
  return { name: file.name, path, size: file.size, type: file.type };
}
export async function reportEvidenceUrl(path) {
  const { data, error } = await db().storage.from('report-evidence').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function addReportContribution(reportId, note, evidence = []) {
  const { error } = await db().from('report_contributions').insert({ report_id: reportId, note, evidence });
  if (error) throw error;
}
export async function getReportingConfig() {
  const { data, error } = await db().from('reporting_config').select('*');
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}
export async function setReportingConfig(key, value) {
  const { error } = await db().from('reporting_config').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}


/* Phase 135b — appointment acceptance + onboarding checklist */
export const acceptAppointment = () => appRpc('accept_appointment', {});
export const declineAppointment = (reason) => appRpc('decline_appointment', { reason });
export const completeOnboardingStep = (code, seconds, reachedEnd, note) => appRpc('complete_onboarding_step', { p_code: code, p_seconds: seconds || 0, p_reached_end: !!reachedEnd, p_note: note || null });
export const onboardingGateOpen = () => appRpc('onboarding_gate_open', {});
export const onboardingEvidence = (pid) => appRpc('onboarding_evidence', { pid });
export const onboardingStatus = (pid) => appRpc('onboarding_status', pid ? { pid } : {});
export const onboardingOverview = () => appRpc('onboarding_overview', {});
export async function setOnboardingStep(code, done) {
  const { data: { session } } = await db().auth.getSession();
  if (done) {
    const { error } = await db().from('onboarding_progress').upsert({ profile_id: session.user.id, step_code: code });
    if (error) throw error;
  } else {
    const { error } = await db().from('onboarding_progress').delete().eq('profile_id', session.user.id).eq('step_code', code);
    if (error) throw error;
  }
  try { window.dispatchEvent(new Event('wdos:onboarding-changed')); } catch { /* not in a browser */ }
}


/* Phase 136 — referral links */
export const REF_KEY = 'wdos.ref';
export const referralVisit = (code, meta) => appRpc('referral_visit', { p_code: code, meta: meta || {} });
export const referralAttach = (code, email, visit) => appRpc('referral_attach', { p_code: code, p_email: email, p_visit: visit || null });
export const referralLinkEnsure = (f = {}) => appRpc('referral_link_ensure', {
  p_network: f.network || null, p_unit: f.unit || null, p_role: f.role || null,
  p_label: f.label || null, p_campaign: f.campaign || null, p_hq: !!f.hq });
export const referralOverview = (scope) => appRpc('referral_overview', { p_scope: scope || 'mine' });
export const referralLinkToggle = (id, active) => appRpc('referral_link_toggle', { p_id: id, p_active: active });
/* Phase 192 — 3-Day referral / 7-Day open-call activation */
export const referralActivationLink = (network, unit, role, label, note, expires) =>
  appRpc('referral_activation_link', { p_network: network, p_unit: unit || null, p_role: role, p_label: label || null, p_note: note || null, p_expires: expires || null });
export const referralLinkInfo = (code) => appRpc('referral_link_info', { p_code: code });
export const beginReferralActivation = (code, form) => appRpc('begin_referral_activation', { p_code: code, p_form: form || {} });
export const openActivationFor = (profile, role, unit, network) => appRpc('open_activation_for', { p_profile: profile, p_role: role, p_unit: unit || null, p_network: network });
export const myActivation = () => appRpc('my_activation', {});
export const saveActivationDay = (day, answers, acks, reachedEnd, seconds, complete) =>
  appRpc('save_activation_day', { p_day: day, p_answers: answers || {}, p_acks: acks || [], p_reached_end: !!reachedEnd, p_seconds: seconds || 0, p_complete: !!complete });
export const submitReadiness = (answers) => appRpc('submit_readiness', { p_answers: answers || {} });
export const requestActivationExtension = (reason) => appRpc('request_activation_extension', { p_reason: reason || '' });
export const decideActivationExtension = (id, approve, until, reason) => appRpc('decide_activation_extension', { p_activation: id, p_approve: !!approve, p_until: until || null, p_reason: reason || null });
export const reviewReadiness = (id, scores, comments, action, note, outcome, disclosed) =>
  appRpc('review_readiness', { p_assessment: id, p_scores: scores || {}, p_comments: comments || {}, p_action: action, p_return_note: note || null, p_outcome: outcome || null, p_disclosed: disclosed || null });
export const hqActivationAnalytics = (days) => appRpc('hq_activation_analytics', { p_days: days || 90 });
export const hqReadinessDetail = (id) => appRpc('hq_readiness_detail', { p_assessment: id });
export const hqLinkTracking = (route) => appRpc('hq_link_tracking', { p_route: route || 'ref3' });
export const referralLinkSet = (id, active, expires, code) => appRpc('referral_link_set', { p_id: id || null, p_active: !!active, p_expires: expires || null, p_code: code || null });
export const readinessForm = () => appRpc('readiness_form', {});
export const submitReadinessV2 = (payload) => appRpc('submit_readiness_v2', { p_payload: payload });
export const reviewReadinessV2 = (id, shortScore, understanding, nextStage, comments, action, note, outcome, disclosed) =>
  appRpc('review_readiness_v2', { p_assessment: id, p_short_score: shortScore ?? null, p_understanding: understanding || null, p_next_stage: nextStage || null,
    p_comments: comments || null, p_action: action, p_return_note: note || null, p_outcome: outcome || null, p_disclosed: disclosed || null });
export const hqActivationRanking = () => appRpc('hq_activation_ranking', {});
export const hqAppointCandidate = (id, reason) => appRpc('hq_appoint_candidate', { p_activation: id, p_reason: reason || null });
export const hqCandidateComms = (n) => appRpc('hq_candidate_comms', { p_limit: n || 200 });
export const hqActivationErrors = (n) => appRpc('hq_activation_errors', { p_limit: n || 50 });
export const myCandidateState = () => appRpc('my_candidate_state', {});
export const hqReferralForms = () => appRpc('hq_referral_forms', {});
export const hqUserReadiness = () => appRpc('hq_user_readiness', {});
export const hqActivationMaster = (days) => appRpc('hq_activation_master', { p_days: days || 365 });
// Phase 210: accurate, scalable activation analytics (aggregates in the database, paged register, one detail call)
export const hqActivationStats = (route, includeTest) => appRpc('hq_activation_stats', { p_route: route || 'ref3', p_include_test: !!includeTest });
export const hqActivationRegister = (o) => appRpc('hq_activation_register', { p_route: o?.route || 'ref3', p_q: o?.q || null, p_network: o?.network || null, p_stage: o?.stage || null, p_country: o?.country || null, p_include_test: !!o?.includeTest, p_limit: o?.limit || 50, p_offset: o?.offset || 0 });
export const hqActivationCandidate = (id) => appRpc('hq_activation_candidate', { p_activation: id });
export const hqActivationSetTest = (id, isTest, note) => appRpc('hq_activation_set_test', { p_activation: id, p_is_test: !!isTest, p_note: note || null });
// Phase 210: position mailboxes (the WGMN Africa structure's role email accounts)
export const myPositionMailbox = (reveal) => appRpc('my_position_mailbox', { p_reveal: !!reveal });
export const hqPositionMailboxes = (o) => appRpc('hq_position_mailboxes', { p_country: o?.country || null, p_q: o?.q || null, p_level: o?.level ?? null, p_only: o?.only || null, p_limit: o?.limit || 100, p_offset: o?.offset || 0 });
export const hqSetMailboxGate = (mode) => appRpc('hq_set_mailbox_gate', { p_mode: mode });
export const geoCountries = () => appRpc('geo_countries', {});
export const geoChildren = (parent) => appRpc('geo_children', { p_parent: parent });
export const geoLevels = (iso) => appRpc('geo_levels', { p_iso: iso || '' });
export function joinUrl(code) { return `${location.origin}${location.pathname}#/join/${code}`; }
export function referralUrl(code) { return `${location.origin}${location.pathname}#/r/${code}`; }
export function storedReferral() {
  try {
    const r = JSON.parse(localStorage.getItem(REF_KEY) || 'null');
    if (r && Date.now() - new Date(r.at).getTime() < 30 * 86400000) return r;
  } catch { /* ignore */ }
  return null;
}
/** Called by the public doors after a successful submission: stamps the record
 *  with the referral code the device holds. Never throws. */
export async function attachStoredReferral(email) {
  const r = storedReferral();
  if (!r || !email) return;
  try { await referralAttach(r.code, email, r.visit_id || null); } catch { /* best effort */ }
}


/* Phase 145 — applicant photo before she has a login */
export async function emailHash(email) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function uploadPendingPhoto(email, file) {
  const h = await emailHash(email);
  const ext = /png$/i.test(file.type) ? 'png' : /webp$/i.test(file.type) ? 'webp' : 'jpg';
  const { error } = await db().storage.from('pending-photos').upload(`${h}.${ext}`, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return `${h}.${ext}`;
}
/** First sign-in: move a pending registration photo onto the profile. Never throws. */
export async function adoptPendingPhoto(profile) {
  try {
    if (!profile?.email || localStorage.getItem('wdos.photoAdopted') === profile.id) return;
    const h = await emailHash(profile.email);
    for (const ext of ['jpg', 'png', 'webp']) {
      const { data } = await db().storage.from('pending-photos').download(`${h}.${ext}`);
      if (data && data.size) {
        await uploadAvatar(profile.id, new File([data], `photo.${ext}`, { type: data.type || 'image/jpeg' }));
        await db().storage.from('pending-photos').remove([`${h}.${ext}`]).catch(() => {});
        break;
      }
    }
    localStorage.setItem('wdos.photoAdopted', profile.id);
  } catch { /* best effort */ }
}


/* Phase 149 — country dashboard, contact list, directory seat target */
export const myMonthlyInspiration = (anyDay) => appRpc('my_monthly_inspiration', { p_any_day: !!anyDay });
export const myFounderWelcome = () => appRpc('my_founder_welcome', {});
export const founderWelcomeSeen = (id) => appRpc('founder_welcome_seen', { p_content_id: id });
export const myHqMessage = (anyDay) => appRpc('my_hq_message', { p_record: true, p_any_day: !!anyDay });
export const hqMessageSeen = (id, state) => appRpc('hq_message_seen', { p_message_id: id, p_state: state });
export const myHqArchive = (n) => appRpc('my_hq_message_archive', { p_limit: n || 30 });
export const hqMessageStats = (id) => appRpc('hq_message_stats', { p_message_id: id || null });
export const myMessageStream = () => appRpc('my_message_stream', {});
export const birthdayWatch = () => appRpc('birthday_watch', {});
export const countryDashboard = (unit, net) => cachedRpc(`country:${unit || 'own'}:${net || ''}`, () => appRpc('country_dashboard', { p_unit: unit || null, p_net: net || null }));
export const directorySeatTarget = (code) => appRpc('directory_seat_target', { p_code: code });
export const registerContactsApply = () => appRpc('register_contacts_apply', {});

export const registerContactsNgApply = () => appRpc('register_contacts_ng_apply', {});
export const hqBackdateSeat = (pid, role, d) => appRpc('hq_backdate_seat', { pid, p_role: role, d });


/* Phase 170 session backup and silent recovery: retired in Phase 212. It
   kept a second copy of the tokens and, on an unexpected sign-out, handed
   them back to the library. Those tokens could belong to another window's
   sign-in, and reusing an already-rotated refresh token makes Supabase revoke
   the whole session. The causes it papered over (device clock, rate limit,
   windows sharing a refresh token) are fixed at the source; see initDb(). */


/* Phase 174 — Tasks & Follow-Up: bulk assignment, batches, follow-up tracker */
export const resolveBulkRecipients = (role, net, country, unit) =>
  appRpc('resolve_bulk_recipients', { p_role: role || null, p_net: net || null, p_country: country || null, p_unit: unit || null });
export const assignTaskBulk = ({ title, details, priority, requiresApproval, dueOn, completionRequirements, recipients }) =>
  appRpc('hq_assign_task_bulk', { p_title: title, p_details: details || null, p_priority: priority, p_requires_approval: !!requiresApproval,
    p_due_on: dueOn || null, p_completion_requirements: completionRequirements || [], p_recipients: recipients });
export const taskBatchSummary = (batchId) => appRpc('task_batch_summary', { p_batch: batchId });
export const myTaskBatches = () => appRpc('my_task_batches', {});
export const taskFollowupTracker = () => appRpc('task_followup_tracker', {});
export const hqSetBirthDate = (pid, d) => appRpc('hq_set_birth_date', { pid, d: d || null });


/* Phase 176 — network_snapshot (cheap hero-panel data) + a short client-side
   cache for the heavy HQ dashboard aggregates, so switching pages and coming
   back to the dashboard within a minute does not re-run a costly query. */
export const networkSnapshot = (net) => appRpc('network_snapshot', { p_net: net || 'all' });

const _dashCache = new Map();      // key -> { at, promise }
const DASH_CACHE_MS = 45000;
export function cachedRpc(key, run) {
  const hit = _dashCache.get(key);
  if (hit && Date.now() - hit.at < DASH_CACHE_MS) return hit.promise;
  const p = run();
  _dashCache.set(key, { at: Date.now(), promise: p });
  p.catch(() => _dashCache.delete(key));   // a failed call is not worth caching
  return p;
}
export function invalidateDashCache() { _dashCache.clear(); }


/* Phase 211 — Operations Centre (Head of Field & Country Operations) */
export const opsLeaders = (o = {}) => appRpc('ops_leaders', { p_net: o.net || null, p_country: o.country || null, p_level: o.level || null, p_status: o.status || null,
  p_q: o.q || null, p_sort: o.sort || 'score', p_days: o.days || 30, p_limit: o.limit || 50, p_offset: o.offset || 0 });
export const opsLeaderDetail = (id, days) => appRpc('ops_leader_detail', { p_profile: id, p_days: days || 90 });
export const opsActivityFeed = (o = {}) => appRpc('ops_activity_feed', { p_net: o.net || null, p_country: o.country || null, p_days: o.days || 14, p_kind: o.kind || null, p_limit: o.limit || 100 });
export const opsSendMessage = (o) => appRpc('ops_send_message', { p_ids: o.ids || null, p_body: o.body, p_subject: o.subject || null, p_email: !!o.email,
  p_net: o.net || null, p_country: o.country || null, p_level: o.level || null, p_status: o.status || null, p_q: o.q || null, p_auto_rule: null });
export const opsMessageHistory = (n) => appRpc('ops_message_history', { p_limit: n || 30 });
export const opsMessageBatch = (id) => appRpc('ops_message_batch', { p_batch: id });
export const opsAssignTask = (o) => appRpc('ops_assign_task', { p_ids: o.ids || null, p_title: o.title, p_details: o.details || null, p_priority: o.priority || 'medium',
  p_due_on: o.dueOn || null, p_requires_approval: !!o.requiresApproval, p_requirements: o.requirements || [],
  p_net: o.net || null, p_country: o.country || null, p_level: o.level || null, p_status: o.status || null, p_q: o.q || null });
export const opsTaskBatches = (n) => appRpc('ops_task_batches', { p_limit: n || 30 });
export const opsWdosReport = (net, days) => appRpc('ops_wdos_report', { p_net: net || null, p_days: days || 30 });
export const opsAutopilotState = () => appRpc('ops_autopilot_state', {});
export const opsAutopilotSet = (code, enabled, params) => appRpc('ops_autopilot_set', { p_code: code, p_enabled: enabled, p_params: params || null });
