/* ---------------------------------------------------------------------------
 * Phase 216 — database refusals in plain words.
 * The database rightly refuses some actions ("Not allowed", "No leadership
 * unit", "You do not hold a leadership seat..."). Those messages were shown
 * as they came. 189 signed-in people are marked as leaders but hold no seat
 * yet; they met those raw messages on Reporting and My leadership structure.
 * This turns the known refusals into a sentence that says what is going on
 * and what opens the page. Anything unknown is shown as before.
 * ------------------------------------------------------------------------- */
import { t } from './i18n.js';

const RULES = [
  [/do not hold a leadership seat|no leadership unit|not a leader|no seat/i, 'perr.noSeat'],
  [/^not allowed$|outside your leadership scope|permission denied/i, 'perr.notAllowed'],
  [/^hq only$/i, 'perr.hqOnly'],
  [/not signed in|jwt expired|invalid jwt/i, 'perr.signedOut'],
];

/** A sentence for the person; `fallback` when there is nothing to say. */
export function plainError(err, fallback) {
  const msg = String(err?.message || err || '').trim();
  for (const [re, key] of RULES) {
    if (re.test(msg)) { const s = t(key); if (s && s !== key) return s; }
  }
  return msg || fallback || t('errors.load');
}
