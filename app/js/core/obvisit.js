/* ---------------------------------------------------------------------------
 * Phase 214 — onboarding "visit" steps that actually complete.
 *
 * A visit step ("Confirm my reporting line", "Open the reporting templates",
 * "Draft my first 30/60/90-day plan") sends the leader to another WDOS page.
 * Until now the onboarding page remembered "she opened it" only in its own
 * memory, which is thrown away the moment she leaves the page, so coming back
 * always showed the step as not opened and Next never unlocked. And step 2's
 * page (#/my/network) was refused by the onboarding gate itself, so she was
 * sent straight back without ever seeing it.
 *
 * Now: pressing "Open the page" writes a small record in this browser (who,
 * which step, which page, when). That page is let through the onboarding
 * gate; when she has been on it for a few seconds the step is recorded as
 * done on the server, and a bar at the bottom takes her back to onboarding.
 * If the server cannot be reached, the record alone unlocks Next on the
 * onboarding page, so nobody is ever stuck on a visit step again.
 * ------------------------------------------------------------------------- */
import { completeOnboardingStep } from './db.js';
import { t } from './i18n.js';

const KEY = 'wdos.ob.visit';
const MAX_AGE = 7 * 864e5;
const DWELL_MS = 3000;

function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } }

/** True when `hash` is the page `href` points at (query ignored, sub-pages included). */
export function hrefMatches(href, hash) {
  const base = String(href || '').split('?')[0];
  const here = String(hash || '#/').split('?')[0];
  return base.startsWith('#/') && base !== '#/' && (here === base || here.startsWith(base + '/'));
}

/** Remember that this leader pressed "Open the page" for a visit step. */
export function markVisit(pid, step, n, of) {
  if (!pid || !step?.code) return;
  const prev = read();
  const keep = prev && prev.pid === pid && prev.code === step.code ? prev : null;
  write({ pid, code: step.code, href: step.href, title: step.title, n, of,
    at: keep ? keep.at : Date.now(), done: keep ? !!keep.done : false });
}

/** The visit record for this leader, if any (and not stale). */
export function readVisit(pid) {
  const v = read();
  if (!v || v.pid !== pid || !v.code || Math.abs(Date.now() - (v.at || 0)) > MAX_AGE) return null;
  return v;
}

export function clearVisit() { try { localStorage.removeItem(KEY); } catch { /* ok */ } }

/** The onboarding gate lets this page through when it is the page of the
 *  visit step she has just opened. */
export function allowedByVisit(pid, hash) {
  const v = readVisit(pid);
  return !!(v && hrefMatches(v.href, hash));
}

let bar = null;
function removeBar() { if (bar) { bar.remove(); bar = null; } }

function showBar(v, state) {
  removeBar();
  bar = document.createElement('div');
  bar.className = 'ob-return';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'grow';
  text.textContent = state === 'done'
    ? t('ob.visitDone', { n: v.n || '', title: v.title || '' })
    : t('ob.visitBar', { n: v.n || '', of: v.of || '', title: v.title || '' });
  const back = document.createElement('a');
  back.href = '#/my/onboarding';
  back.className = 'btn btn--primary';
  back.textContent = state === 'done' ? t('ob.continue') : t('ob.backTo');
  bar.append(text, back);
  document.body.append(bar);
  window.addEventListener('hashchange', removeBar, { once: true });
}

/** Called after every signed-in page has been drawn. On the page of the
 *  visit step she opened: show the way back, and record the step as done
 *  once she has had a few seconds on the page. */
export function onPageShown(pid, hash) {
  const v = readVisit(pid);
  if (!v || !hrefMatches(v.href, hash)) { return; }
  showBar(v, v.done ? 'done' : 'open');
  if (v.done) return;
  const arrived = Date.now();
  setTimeout(async () => {
    if (!hrefMatches(v.href, location.hash)) return;           // she left at once: Next unlocks from the record
    try {
      await completeOnboardingStep(v.code, Math.round((Date.now() - arrived) / 1000), true, null);
      write({ ...v, done: true });
      window.dispatchEvent(new CustomEvent('wdos:onboarding-changed'));
      if (hrefMatches(v.href, location.hash)) showBar(v, 'done');
    } catch { /* offline or refused: the record still unlocks Next on the onboarding page */ }
  }, DWELL_MS);
}
